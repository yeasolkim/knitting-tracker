import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { ExtraPatternFile, PatternType } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import FileDropZone from '@/components/FileDropZone';
import YarnLoader from '@/components/YarnLoader';
import { useLanguage } from '@/contexts/LanguageContext';
import { filterUnreferencedUrls } from '@/lib/storageRefs';
import type { ImagePerState, SubPattern } from '@/lib/types';
import { configurePdfWorker } from '@/lib/pdfWorker';
import { downscaleImage, makeThumbnail } from '@/lib/imageUtils';

type ImageEntry =
  | {
      kind: 'existing';
      key: string;
      url: string;
      thumbUrl: string | null;
      fileType: 'image' | 'pdf';
      name: string;
      /** Index this file had when the pattern was loaded — used to remap per-image progress. */
      origIndex: number;
    }
  | {
      kind: 'new';
      key: string;
      file: File;
      /** Blob URL for image previews; '' for PDFs. */
      previewUrl: string;
      name: string;
    };

const isUploadable = (f: File) => f.type.startsWith('image/') || f.type === 'application/pdf';
let entryKeySeq = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(entryKeySeq++).toString(36)}`;

// Top-level pattern_progress columns mirror image_states[0] for backward compatibility.
function compatColumnsFromState(s: ImagePerState | undefined): Record<string, unknown> {
  if (!s) return {};
  const out: Record<string, unknown> = {};
  if (s.ruler_position_y != null) out.ruler_position_y = s.ruler_position_y;
  if (s.ruler_height != null) out.ruler_height = s.ruler_height;
  if (s.ruler_direction != null) out.ruler_direction = s.ruler_direction;
  if (s.ruler_orientation != null) out.ruler_orientation = s.ruler_orientation;
  if (s.ruler_position_x != null) out.ruler_position_x = s.ruler_position_x;
  if (s.ruler_rotation != null) out.ruler_rotation = s.ruler_rotation;
  if (s.completed_marks) out.completed_marks = s.completed_marks;
  if (s.crochet_marks) out.crochet_marks = s.crochet_marks;
  if (s.knitting_marks) out.knitting_marks = s.knitting_marks;
  if (s.notes) out.notes = s.notes;
  if (s.note_positions) out.note_positions = s.note_positions;
  if (s.crochet_ruler_data) out.crochet_ruler_data = s.crochet_ruler_data;
  return out;
}

async function generatePdfThumbnail(file: File): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist');
  configurePdfWorker(pdfjsLib.GlobalWorkerOptions);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');

  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Thumbnail blob generation failed'));
      else resolve(blob);
    }, 'image/jpeg', 0.8);
  });
}

/** PDF first-page thumbnail with a 10s cap; null on any failure. */
function pdfThumbnailWithTimeout(file: File): Promise<Blob | null> {
  return Promise.race([
    generatePdfThumbnail(file),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
  ]).catch(() => null);
}

async function uploadFile(
  supabase: ReturnType<typeof createClient>,
  file: File,
  userId: string,
  patternId: string,
  t: (key: TranslationKey) => string,
): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${patternId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { data: presignData, error: presignError } = await supabase.functions.invoke('r2-presign', {
    body: { path, contentType: file.type },
  });
  if (presignError) throw new Error(t('form.error.presign'));
  const { presignedUrl, fileUrl } = presignData;
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(t('form.error.upload'));
  return fileUrl as string;
}

/** Upload a generated blob (thumbnail) to a fixed path. Returns the public URL or null; never throws. */
async function uploadBlob(
  supabase: ReturnType<typeof createClient>,
  blob: Blob,
  path: string,
  contentType: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('r2-presign', {
      body: { path, contentType },
    });
    if (error || !data) return null;
    const res = await fetch(data.presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    return res.ok ? (data.fileUrl as string) : null;
  } catch {
    return null;
  }
}

export default function PatternEdit() {
  return (
    <AuthGuard>
      {(user, _authLoading) => (
        <div className="min-h-screen bg-[#faf9f7]">
          <Navbar userEmail={user.email} />
          <main className="max-w-lg mx-auto px-4 py-8 sm:py-12">
            <EditForm />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}

function EditForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PatternType>('knitting');
  const [yarn, setYarn] = useState('');
  const [needle, setNeedle] = useState('');
  const [totalRows, setTotalRows] = useState('');
  const loadedTotalRowsRef = useRef<number>(1);

  // One ordered list: existing files (already uploaded) and new files (pending upload).
  // entries[0] is the primary file.
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [resized, setResized] = useState(false);

  const extraInputRef = useRef<HTMLInputElement>(null);

  // New primary file (optional replacement of an *existing* entries[0])
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);

  // Revoke any preview blob URLs still alive when leaving the page
  const newPreviewRef = useRef<string | null>(null);
  newPreviewRef.current = newPreview;
  const entriesRef = useRef<ImageEntry[]>([]);
  entriesRef.current = entries;
  useEffect(() => () => {
    if (newPreviewRef.current) URL.revokeObjectURL(newPreviewRef.current);
    entriesRef.current.forEach((e) => { if (e.kind === 'new' && e.previewUrl) URL.revokeObjectURL(e.previewUrl); });
  }, []);

  // Paste hint is pointless on touch-only devices (no Ctrl+V)
  const canPaste = useMemo(
    () => !(typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches),
    [],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('patterns')
      .select('id,title,type,yarn,needle,file_url,thumbnail_url,file_type,image_names,extra_image_urls,total_rows')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) { navigate('/dashboard'); return; }
        setTitle(data.title);
        setType(data.type as PatternType);
        setYarn(data.yarn || '');
        setNeedle(data.needle || '');
        setTotalRows(String(data.total_rows || 1));
        loadedTotalRowsRef.current = data.total_rows || 1;

        const names = (data.image_names as string[] | null) || [];
        const imgs: ImageEntry[] = [
          {
            kind: 'existing',
            key: nextKey('ex'),
            url: data.file_url,
            thumbUrl: data.thumbnail_url,
            fileType: data.file_type as 'image' | 'pdf',
            name: names[0] || '',
            origIndex: 0,
          },
          ...((data.extra_image_urls as ExtraPatternFile[]) || []).map((e, i): ImageEntry => ({
            kind: 'existing',
            key: nextKey('ex'),
            url: e.url,
            thumbUrl: e.thumbnail_url,
            fileType: (e.file_type ?? (e.url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image')) as 'image' | 'pdf',
            name: names[i + 1] || '',
            origIndex: i + 1,
          })),
        ];
        setEntries(imgs);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, navigate, supabase]);

  const clearNewFile = () => {
    if (newPreview) URL.revokeObjectURL(newPreview);
    setNewPreview(null);
    setNewFile(null);
  };

  // Replace the primary file (only offered while entries[0] is an existing file)
  const handleFileSelect = async (selectedFile: File) => {
    const processed = selectedFile.type.startsWith('image/') ? await downscaleImage(selectedFile) : selectedFile;
    if (processed !== selectedFile) setResized(true);
    setIsDirty(true);
    setNewFile(processed);
    setNewPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return processed.type.startsWith('image/') ? URL.createObjectURL(processed) : null;
    });
  };

  // Append new files (file picker, paste) to the unified list
  const addNewFiles = async (incoming: File[]) => {
    const accepted = incoming.filter(isUploadable);
    if (accepted.length === 0) return;
    const processed = await Promise.all(
      accepted.map((f) => (f.type.startsWith('image/') ? downscaleImage(f) : Promise.resolve(f))),
    );
    if (processed.some((f, i) => f !== accepted[i])) setResized(true);
    // Create blob URLs outside the updater (updaters may run twice in StrictMode).
    const added: ImageEntry[] = processed.map((file) => ({
      kind: 'new',
      key: nextKey('new'),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      name: '',
    }));
    setEntries((prev) => [...prev, ...added]);
    setIsDirty(true);
  };
  const addNewFilesRef = useRef(addNewFiles);
  addNewFilesRef.current = addNewFiles;

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files ?? []).filter(isUploadable);
      if (pasted.length === 0) return;
      e.preventDefault();
      void addNewFilesRef.current(pasted);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const handleExtraFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) void addNewFiles(selected);
    e.target.value = '';
  };

  const removeEntry = (index: number) => {
    if (entries.length <= 1) return; // at least one image must remain
    const entry = entries[index];
    if (!entry) return;
    if (entry.kind === 'existing') {
      const toDelete = [entry.url];
      if (entry.thumbUrl && entry.thumbUrl !== entry.url) toDelete.push(entry.thumbUrl);
      setImagesToDelete((prev) => [...prev, ...toDelete]);
    } else if (entry.previewUrl) {
      URL.revokeObjectURL(entry.previewUrl);
    }
    // The pending primary replacement belonged to the slot being removed
    if (index === 0 && newFile) clearNewFile();
    setEntries((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const moveEntry = (index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= entries.length) return;
    // A primary replacement is tied to whichever file sits at index 0; drop it when that changes.
    if ((index === 0 || newIdx === 0) && newFile) clearNewFile();
    setEntries((prev) => {
      const next = [...prev];
      [next[index], next[newIdx]] = [next[newIdx], next[index]];
      return next;
    });
    setIsDirty(true);
  };

  const renameEntry = (index: number, name: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, name } : e)));
    setIsDirty(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t('form.error.login'));
      const userId = session.user.id;

      const primary = entries[0];
      if (!primary) throw new Error(t('form.error.save'));
      const urlsToDelete: string[] = [...imagesToDelete];

      // Upload one new file and produce its final record (url / thumbnail / type).
      const uploadNewEntry = async (file: File, asPrimary: boolean): Promise<ExtraPatternFile> => {
        const isPdf = file.type === 'application/pdf';
        const thumbPromise = isPdf ? pdfThumbnailWithTimeout(file) : null;
        const url = await uploadFile(supabase, file, userId, id!, t);

        let thumbnailUrl: string | null = isPdf ? null : url;
        if (isPdf) {
          const thumbBlob = await thumbPromise;
          if (thumbBlob) {
            const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const path = `${userId}/${id}/${asPrimary ? 'thumb' : 'thumb_extra'}_${stamp}.jpg`;
            const uploaded = await uploadBlob(supabase, thumbBlob, path, 'image/jpeg');
            if (uploaded) thumbnailUrl = uploaded;
          }
        } else if (asPrimary) {
          // Small JPEG for the dashboard card; fall back to the full image.
          const thumbBlob = await makeThumbnail(file);
          if (thumbBlob) {
            const uploaded = await uploadBlob(supabase, thumbBlob, `${userId}/${id}/thumb_${Date.now()}.jpg`, 'image/jpeg');
            if (uploaded) thumbnailUrl = uploaded;
          }
        }
        return { url, thumbnail_url: thumbnailUrl, file_type: isPdf ? 'pdf' : 'image' };
      };

      // --- Primary ---
      let fileUrl: string;
      let fileType: 'image' | 'pdf';
      let thumbnailUrl: string | null;
      let fileSize: number | null = null;

      if (primary.kind === 'existing' && newFile) {
        // Replace an existing primary in place (its progress slot is kept)
        const rec = await uploadNewEntry(newFile, true);
        if (primary.url && primary.url !== rec.url) urlsToDelete.push(primary.url);
        if (primary.thumbUrl && primary.thumbUrl !== primary.url && primary.thumbUrl !== rec.url) urlsToDelete.push(primary.thumbUrl);
        fileUrl = rec.url;
        fileType = rec.file_type ?? 'image';
        thumbnailUrl = rec.thumbnail_url;
        fileSize = newFile.size;
      } else if (primary.kind === 'existing') {
        fileUrl = primary.url;
        fileType = primary.fileType;
        thumbnailUrl = primary.thumbUrl;
      } else {
        const rec = await uploadNewEntry(primary.file, true);
        fileUrl = rec.url;
        fileType = rec.file_type ?? 'image';
        thumbnailUrl = rec.thumbnail_url;
        fileSize = primary.file.size;
      }

      // --- Extras, in the unified order (new files uploaded in parallel) ---
      const finalExtraImageUrls: ExtraPatternFile[] = await Promise.all(
        entries.slice(1).map(async (entry): Promise<ExtraPatternFile> => {
          if (entry.kind === 'existing') {
            return { url: entry.url, thumbnail_url: entry.thumbUrl, file_type: entry.fileType };
          }
          return uploadNewEntry(entry.file, false);
        })
      );

      const finalImageNames: string[] = entries.map((entry) => entry.name);

      const newTotalRows = Math.min(99999, Math.max(1, parseInt(totalRows, 10) || 1));
      const { error: updateError } = await supabase
        .from('patterns')
        .update({
          title, type, yarn, needle,
          total_rows: newTotalRows,
          file_url: fileUrl,
          file_type: fileType,
          thumbnail_url: thumbnailUrl,
          extra_image_urls: finalExtraImageUrls,
          image_names: finalImageNames,
          ...(fileSize != null ? { file_size: fileSize } : {}),
        })
        .eq('id', id!)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      // A single-part pattern shows the pattern's total in its row counter; keep it in sync.
      if (newTotalRows !== loadedTotalRowsRef.current) {
        try {
          const { data: prog } = await supabase
            .from('pattern_progress')
            .select('sub_patterns')
            .eq('pattern_id', id!)
            .eq('user_id', userId)
            .maybeSingle();
          const subs = prog?.sub_patterns as SubPattern[] | null | undefined;
          if (subs && subs.length === 1) {
            await supabase
              .from('pattern_progress')
              .update({ sub_patterns: [{ ...subs[0], total_rows: newTotalRows }] })
              .eq('pattern_id', id!)
              .eq('user_id', userId);
          }
        } catch { /* best-effort */ }
      }

      // Per-image progress (image_states) is indexed by file position. If files were
      // reordered, removed or inserted, permute the saved states the same way so marks,
      // ruler, notes and drawings stay with their image. New files get an empty slot.
      const order: (number | null)[] = entries.map((entry) => (entry.kind === 'existing' ? entry.origIndex : null));
      const orderChanged = order.some((orig, i) => orig !== i) || imagesToDelete.length > 0;
      if (orderChanged) {
        try {
          const { data: prog } = await supabase
            .from('pattern_progress')
            .select('image_states')
            .eq('pattern_id', id!)
            .eq('user_id', userId)
            .maybeSingle();
          const oldStates = (prog?.image_states as (ImagePerState | null)[] | null) ?? [];
          if (prog && oldStates.length > 0) {
            const newStates: (ImagePerState | null)[] = order.map((orig) => (orig == null ? null : oldStates[orig] ?? null));
            await supabase
              .from('pattern_progress')
              .update({ image_states: newStates, ...compatColumnsFromState(newStates[0] ?? undefined) })
              .eq('pattern_id', id!)
              .eq('user_id', userId);
          }
        } catch {
          // progress remap is best-effort; the pattern itself is already saved
        }
      }

      const uniqueToDelete = [...new Set(urlsToDelete)].filter(Boolean);
      if (uniqueToDelete.length > 0) {
        // A duplicate of this pattern may still point at these objects
        const deletable = await filterUnreferencedUrls(supabase, userId, uniqueToDelete, id!);
        if (deletable.length > 0) {
          supabase.functions.invoke('r2-delete', { body: { urls: deletable } }).catch(() => {});
        }
      }

      setIsDirty(false);
      navigate(`/patterns/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.error.save'));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <YarnLoader />
      </div>
    );
  }

  if (saving) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <YarnLoader text={t('form.saving')} />
      </div>
    );
  }

  const primary = entries[0];
  const primaryIsNew = primary?.kind === 'new';
  const displayThumb = newPreview
    || (newFile ? null
      : primary?.kind === 'existing'
        ? (primary.thumbUrl || (primary.fileType === 'image' ? primary.url : null))
        : primary?.kind === 'new' ? (primary.previewUrl || null) : null);
  const primaryIsPdf = primary?.kind === 'existing' ? primary.fileType === 'pdf' : primary?.file.type === 'application/pdf';
  const totalImageCount = entries.length;

  const entryThumb = (entry: ImageEntry) => {
    const src = entry.kind === 'existing'
      ? (entry.thumbUrl || (entry.fileType !== 'pdf' ? entry.url : null))
      : (entry.previewUrl || null);
    if (src) return <img src={src} alt="" className="w-full h-full object-cover" />;
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-[7px] text-[#a08060] font-bold">PDF</span>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-7">
        {showLeaveConfirm ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
            <span className="text-xs text-[#7a5c46]">{t('edit.unsavedWarning')}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDirty(false);
                  navigate(`/patterns/${id}`);
                }}
                className="text-xs font-bold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] rounded-lg px-3 py-1 min-h-[44px] hover:bg-[#9a4318] transition-colors"
              >
                {t('edit.unsavedLeave')}
              </button>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="text-xs text-[#a08060] hover:text-[#3d2b1f] transition-colors min-h-[44px] px-2"
              >
                {t('card.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (isDirty) {
                setShowLeaveConfirm(true);
              } else {
                navigate(`/patterns/${id}`);
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] min-h-[44px] transition-colors tracking-wide font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5541e] rounded"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('form.backToPattern')}
          </button>
        )}
        <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] mt-1 tracking-tight">{t('form.titleEdit')}</h1>
      </div>

      {/* Primary file section */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.file')}
        </label>
        {newFile ? (
          <div className="space-y-2.5">
            <div className="bg-[#fdf6e8] rounded-xl p-4 border-2 border-[#b07840]">
              {newPreview ? (
                <img src={newPreview} alt={t('form.previewAlt')} className="max-h-52 mx-auto rounded-lg object-contain" />
              ) : (
                <div className="flex items-center justify-center h-28 gap-3">
                  <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                    <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <p className="text-sm text-[#a08060] truncate min-w-0 flex-1">{newFile.name}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={clearNewFile}
              className="text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors tracking-wide"
            >
              {t('form.fileCancelReplace')}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="bg-[#fdf6e8] rounded-xl p-4 border-2 border-[#b07840]">
              {displayThumb ? (
                <img src={displayThumb} alt="현재 파일" className="max-h-52 mx-auto rounded-lg object-contain" />
              ) : (
                <div className="flex items-center justify-center h-28 gap-3">
                  <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                    <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <p className="text-sm text-[#a08060] truncate min-w-0">
                    {primaryIsNew ? primary.file.name : primaryIsPdf ? t('form.filePdf') : t('form.fileImage')}
                  </p>
                </div>
              )}
            </div>
            {/* Replacing in place only makes sense for an already-uploaded primary;
                a new file at the top is simply what will be uploaded as primary. */}
            {!primaryIsNew && (
              <div>
                <p className="text-[10px] text-[#a08060] mb-2 tracking-wide">{t('form.fileReplaceTip')}</p>
                <FileDropZone onFileSelect={(f) => { void handleFileSelect(f); }} />
                {canPaste && <p className="text-[11px] text-[#c4a882] mt-1.5">{t('form.pasteHint')}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Images section — order, names, delete, add more */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.imageOrderAndName')}
          {totalImageCount > 0 && (
            <span className="ml-1.5 text-[#a08060] normal-case font-normal tracking-normal">
              ({totalImageCount})
            </span>
          )}
        </label>

        <div className="space-y-1.5">
          {entries.map((entry, i) => (
            <div key={entry.key} className="flex items-center gap-2">
              <div
                className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-[#fdf6e8] ${
                  entry.kind === 'new' ? 'border-2 border-dashed border-[#b07840]' : 'border border-[#b07840]'
                }`}
              >
                {entryThumb(entry)}
              </div>
              {i === 0 && (
                <span className="text-[9px] font-bold text-[#b5541e] tracking-widest uppercase flex-shrink-0">
                  {t('form.primaryBadge')}
                </span>
              )}
              <input
                type="text"
                value={entry.name}
                onChange={(e) => renameEntry(i, e.target.value)}
                placeholder={t('form.imageN').replace('{n}', String(i + 1))}
                className="flex-1 min-w-0 border border-[#b07840] bg-[#fdf6e8] rounded-md px-2.5 py-1.5 text-xs text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
              />
              {totalImageCount > 1 && (
                <div className="flex flex-col flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveEntry(i, -1)}
                    disabled={i === 0}
                    aria-label={t('form.moveUp')}
                    className="w-8 py-1.5 flex items-center justify-center text-[#b07840] disabled:opacity-25 hover:text-[#b5541e] transition-colors rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveEntry(i, 1)}
                    disabled={i === entries.length - 1}
                    aria-label={t('form.moveDown')}
                    className="w-8 py-1.5 flex items-center justify-center text-[#b07840] disabled:opacity-25 hover:text-[#b5541e] transition-colors rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeEntry(i)}
                disabled={entries.length <= 1}
                aria-label={t('form.remove')}
                className="w-9 h-9 flex items-center justify-center text-[#b07840] disabled:opacity-20 hover:text-[#b5541e] transition-colors rounded flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Add more */}
          <button
            type="button"
            onClick={() => extraInputRef.current?.click()}
            className="min-h-[44px] flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors"
          >
            <span className="text-base font-light leading-none">+</span>
            {t('form.addMoreImages')}
          </button>
        </div>

        {canPaste && primaryIsNew && (
          <p className="text-[11px] text-[#c4a882] mt-1">{t('form.pasteHint')}</p>
        )}
        {resized && (
          <p className="text-[11px] text-[#b07840] mt-1 flex items-center gap-1">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7" />
            </svg>
            {t('form.resized')}
          </p>
        )}

        <input
          ref={extraInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={handleExtraFilesChange}
        />
      </div>

      {/* Title */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.name')}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
          required
          className="w-full border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.namePlaceholder')}
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.type')}
        </label>
        <div className="flex gap-2">
          {[
            { value: 'knitting' as const, label: t('form.knitting') },
            { value: 'crochet' as const, label: t('form.crochet') },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { setType(option.value); setIsDirty(true); }}
              className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold tracking-wide transition-all ${
                type === option.value
                  ? 'border-[#b5541e] bg-[#b5541e] text-[#fdf6e8]'
                  : 'border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] hover:border-[#b5541e]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Yarn */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.yarn')} <span className="text-[#c4a882] normal-case tracking-normal font-normal text-[10px]">{t('form.yarnOptional')}</span>
        </label>
        <input
          type="text"
          value={yarn}
          onChange={(e) => { setYarn(e.target.value); setIsDirty(true); }}
          className="w-full border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.yarnPlaceholder')}
        />
      </div>

      {/* Needle */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.needle')} <span className="text-[#c4a882] normal-case tracking-normal font-normal text-[10px]">{t('form.yarnOptional')}</span>
        </label>
        <input
          type="text"
          value={needle}
          onChange={(e) => { setNeedle(e.target.value); setIsDirty(true); }}
          className="w-full border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.needlePlaceholder')}
        />
      </div>

      {/* Total rows (optional) */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.totalRows')} <span className="text-[#c4a882] normal-case tracking-normal font-normal text-[10px]">{t('form.yarnOptional')}</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={99999}
          value={totalRows}
          onChange={(e) => { setTotalRows(e.target.value); setIsDirty(true); }}
          className="w-full border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-4 py-2.5 text-base sm:text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.totalRowsPlaceholder')}
        />
        <p className="mt-1 text-[10px] text-[#a08060]">{t('form.totalRowsHint')}</p>
      </div>

      {error && <p className="text-sm text-[#b5541e] font-medium">{error}</p>}

      <button
        type="submit"
        disabled={!title || saving}
        className="w-full bg-[#b5541e] text-[#fdf6e8] py-3 min-h-[48px] rounded-lg text-sm font-bold tracking-widest uppercase hover:bg-[#9a4318] disabled:opacity-40 disabled:cursor-not-allowed transition-all border-2 border-[#9a4318] shadow-[3px_3px_0_#9a4318] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
      >
        {saving ? t('form.saving') : t('form.save')}
      </button>
    </form>
  );
}
