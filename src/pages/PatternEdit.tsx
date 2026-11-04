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

interface OrderedImage {
  url: string;
  thumbUrl: string | null;
  fileType: 'image' | 'pdf';
  name: string;
  /** Index this file had when the pattern was loaded — used to remap per-image progress. */
  origIndex: number;
}

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
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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

  // All existing images in display order (primary first, then extras)
  const [orderedImages, setOrderedImages] = useState<OrderedImage[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);

  const extraInputRef = useRef<HTMLInputElement>(null);

  // New primary file (optional replacement of orderedImages[0])
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);

  // New extra files (not yet uploaded, always appended to end)
  const [newExtraFiles, setNewExtraFiles] = useState<File[]>([]);
  const [newExtraPreviews, setNewExtraPreviews] = useState<string[]>([]);
  const [newExtraNames, setNewExtraNames] = useState<string[]>([]);
  // Revoke any preview blob URLs still alive when leaving the page
  const newPreviewRef = useRef<string | null>(null);
  newPreviewRef.current = newPreview;
  const newExtraPreviewsRef = useRef<string[]>([]);
  newExtraPreviewsRef.current = newExtraPreviews;
  useEffect(() => () => {
    if (newPreviewRef.current) URL.revokeObjectURL(newPreviewRef.current);
    newExtraPreviewsRef.current.forEach((u) => { if (u) URL.revokeObjectURL(u); });
  }, []);

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
        const imgs: OrderedImage[] = [
          {
            url: data.file_url,
            thumbUrl: data.thumbnail_url,
            fileType: data.file_type as 'image' | 'pdf',
            name: names[0] || '',
            origIndex: 0,
          },
          ...((data.extra_image_urls as ExtraPatternFile[]) || []).map((e, i) => ({
            url: e.url,
            thumbUrl: e.thumbnail_url,
            fileType: (e.file_type ?? (e.url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image')) as 'image' | 'pdf',
            name: names[i + 1] || '',
            origIndex: i + 1,
          })),
        ];
        setOrderedImages(imgs);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, navigate, supabase]);

  const handleFileSelect = (selectedFile: File) => {
    setIsDirty(true);
    setNewFile(selectedFile);
    setNewPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return selectedFile.type.startsWith('image/') ? URL.createObjectURL(selectedFile) : null;
    });
  };

  const handleExtraFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (selected.length === 0) return;
    const newPreviews = selected.map((f) =>
      f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
    );
    setNewExtraFiles((prev) => [...prev, ...selected]);
    setNewExtraPreviews((prev) => [...prev, ...newPreviews]);
    setNewExtraNames((prev) => [...prev, ...selected.map(() => '')]);
    setIsDirty(true);
    e.target.value = '';
  };

  const removeOrderedImage = (index: number) => {
    if (orderedImages.length <= 1) return;
    const img = orderedImages[index];
    const toDelete = [img.url];
    if (img.thumbUrl && img.thumbUrl !== img.url) toDelete.push(img.thumbUrl);
    setImagesToDelete((prev) => [...prev, ...toDelete]);
    setOrderedImages((prev) => prev.filter((_, i) => i !== index));
    if (index === 0 && newFile) {
      if (newPreview) URL.revokeObjectURL(newPreview);
      setNewFile(null);
      setNewPreview(null);
    }
    setIsDirty(true);
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= orderedImages.length) return;
    if ((index === 0 || newIdx === 0) && newFile) {
      if (newPreview) URL.revokeObjectURL(newPreview);
      setNewFile(null);
      setNewPreview(null);
    }
    setOrderedImages((prev) => {
      const next = [...prev];
      [next[index], next[newIdx]] = [next[newIdx], next[index]];
      return next;
    });
    setIsDirty(true);
  };

  const removeNewExtra = (index: number) => {
    const url = newExtraPreviews[index];
    if (url) URL.revokeObjectURL(url);
    setNewExtraFiles((prev) => prev.filter((_, i) => i !== index));
    setNewExtraPreviews((prev) => prev.filter((_, i) => i !== index));
    setNewExtraNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t('form.error.login'));

      const primaryImg = orderedImages[0];
      if (!primaryImg) throw new Error(t('form.error.save'));
      let fileUrl = primaryImg?.url ?? '';
      let fileType = primaryImg?.fileType ?? 'image';
      let thumbnailUrl = primaryImg?.thumbUrl ?? null;
      const urlsToDelete: string[] = [...imagesToDelete];

      if (newFile) {
        const isPdf = newFile.type === 'application/pdf';
        const thumbPromise = isPdf ? generatePdfThumbnail(newFile).catch(() => null) : null;

        const uploadedUrl = await uploadFile(supabase, newFile, session.user.id, id!, t);

        if (fileUrl && fileUrl !== uploadedUrl) urlsToDelete.push(fileUrl);
        if (thumbnailUrl && thumbnailUrl !== fileUrl && thumbnailUrl !== uploadedUrl) urlsToDelete.push(thumbnailUrl);

        fileUrl = uploadedUrl;
        fileType = isPdf ? 'pdf' : 'image';

        if (isPdf) {
          const thumbBlob = await thumbPromise;
          if (thumbBlob) {
            try {
              const thumbPath = `${session.user.id}/${id}/thumb_${Date.now()}.jpg`;
              const { data: thumbPresignData, error: thumbPresignError } = await supabase.functions.invoke('r2-presign', {
                body: { path: thumbPath, contentType: 'image/jpeg' },
              });
              if (!thumbPresignError && thumbPresignData) {
                const { presignedUrl: thumbPresigned, fileUrl: thumbFileUrl } = thumbPresignData;
                const thumbUpload = await fetch(thumbPresigned, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'image/jpeg' },
                  body: thumbBlob,
                });
                if (thumbUpload.ok) thumbnailUrl = thumbFileUrl;
              }
            } catch {
              // thumbnail 실패 시 무시
            }
          }
        } else {
          thumbnailUrl = fileUrl;
        }
      }

      // Upload new extra images in parallel
      const uploadedExtraFiles: ExtraPatternFile[] = await Promise.all(
        newExtraFiles.map(async (extraFile, i) => {
          const isExtraPdf = extraFile.type === 'application/pdf';
          const extraUrl = await uploadFile(supabase, extraFile, session.user.id, id!, t);

          let extraThumbUrl: string | null = isExtraPdf ? null : extraUrl;
          if (isExtraPdf) {
            try {
              const thumbBlob = await Promise.race([
                generatePdfThumbnail(extraFile),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
              ]).catch(() => null);
              if (thumbBlob) {
                const thumbPath = `${session.user.id}/${id}/thumb_extra_${Date.now()}_${i}.jpg`;
                const { data: tpd, error: tpe } = await supabase.functions.invoke('r2-presign', {
                  body: { path: thumbPath, contentType: 'image/jpeg' },
                });
                if (!tpe && tpd) {
                  const tres = await fetch(tpd.presignedUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'image/jpeg' },
                    body: thumbBlob,
                  });
                  if (tres.ok) extraThumbUrl = tpd.fileUrl;
                }
              }
            } catch {
              // thumbnail failed, proceed without
            }
          }

          return {
            url: extraUrl,
            thumbnail_url: extraThumbUrl,
            file_type: isExtraPdf ? 'pdf' : 'image',
          } as ExtraPatternFile;
        })
      );

      // orderedImages[1+] are the reordered existing extras
      const existingExtras: ExtraPatternFile[] = orderedImages.slice(1).map((img) => ({
        url: img.url,
        thumbnail_url: img.thumbUrl,
        file_type: img.fileType,
      }));
      const finalExtraImageUrls: ExtraPatternFile[] = [...existingExtras, ...uploadedExtraFiles];

      const finalImageNames: string[] = [
        ...orderedImages.map((img) => img.name),
        ...newExtraNames,
      ];

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
          ...(newFile ? { file_size: newFile.size } : {}),
        })
        .eq('id', id!)
        .eq('user_id', session.user.id);

      if (updateError) throw updateError;

      // A single-part pattern shows the pattern's total in its row counter; keep it in sync.
      if (newTotalRows !== loadedTotalRowsRef.current) {
        try {
          const { data: prog } = await supabase
            .from('pattern_progress')
            .select('sub_patterns')
            .eq('pattern_id', id!)
            .eq('user_id', session.user.id)
            .maybeSingle();
          const subs = prog?.sub_patterns as SubPattern[] | null | undefined;
          if (subs && subs.length === 1) {
            await supabase
              .from('pattern_progress')
              .update({ sub_patterns: [{ ...subs[0], total_rows: newTotalRows }] })
              .eq('pattern_id', id!)
              .eq('user_id', session.user.id);
          }
        } catch { /* best-effort */ }
      }

      // Per-image progress (image_states) is indexed by file position. If files were
      // reordered or removed, permute the saved states the same way so marks, ruler,
      // notes and drawings stay with their image. New files get an empty slot.
      const order = orderedImages.map((img) => img.origIndex);
      const orderChanged = order.some((orig, i) => orig !== i) || imagesToDelete.length > 0;
      if (orderChanged) {
        try {
          const { data: prog } = await supabase
            .from('pattern_progress')
            .select('image_states')
            .eq('pattern_id', id!)
            .eq('user_id', session.user.id)
            .maybeSingle();
          const oldStates = (prog?.image_states as (ImagePerState | null)[] | null) ?? [];
          if (prog && oldStates.length > 0) {
            const newStates: (ImagePerState | null)[] = order.map((orig) => oldStates[orig] ?? null);
            while (newStates.length < order.length + newExtraFiles.length) newStates.push(null);
            await supabase
              .from('pattern_progress')
              .update({ image_states: newStates, ...compatColumnsFromState(newStates[0] ?? undefined) })
              .eq('pattern_id', id!)
              .eq('user_id', session.user.id);
          }
        } catch {
          // progress remap is best-effort; the pattern itself is already saved
        }
      }

      const uniqueToDelete = [...new Set(urlsToDelete)].filter(Boolean);
      if (uniqueToDelete.length > 0) {
        // A duplicate of this pattern may still point at these objects
        const deletable = await filterUnreferencedUrls(supabase, session.user.id, uniqueToDelete, id!);
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

  const primaryImg = orderedImages[0];
  const displayThumb = newPreview || (newFile ? null : (primaryImg?.thumbUrl || (primaryImg?.fileType === 'image' ? primaryImg?.url : null)));
  const totalImageCount = orderedImages.length + newExtraFiles.length;

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
              onClick={() => { if (newPreview) URL.revokeObjectURL(newPreview); setNewFile(null); setNewPreview(null); }}
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
                  <p className="text-sm text-[#a08060]">{primaryImg?.fileType === 'pdf' ? t('form.filePdf') : t('form.fileImage')}</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] text-[#a08060] mb-2 tracking-wide">{t('form.fileReplaceTip')}</p>
              <FileDropZone onFileSelect={handleFileSelect} />
            </div>
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
          {/* Existing images */}
          {orderedImages.map((img, i) => (
            <div key={`ord-${i}-${img.url}`} className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#b07840] flex-shrink-0 bg-[#fdf6e8]">
                {img.thumbUrl ? (
                  <img src={img.thumbUrl} alt="" className="w-full h-full object-cover" />
                ) : img.fileType !== 'pdf' ? (
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[7px] text-[#a08060] font-bold">PDF</span>
                  </div>
                )}
              </div>
              {i === 0 && (
                <span className="text-[9px] font-bold text-[#b5541e] tracking-widest uppercase flex-shrink-0">
                  {t('form.primaryBadge')}
                </span>
              )}
              <input
                type="text"
                value={img.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setOrderedImages((prev) => prev.map((item, idx) => idx === i ? { ...item, name: val } : item));
                  setIsDirty(true);
                }}
                placeholder={t('form.imageN').replace('{n}', String(i + 1))}
                className="flex-1 min-w-0 border border-[#b07840] bg-[#fdf6e8] rounded-md px-2.5 py-1.5 text-xs text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
              />
              {totalImageCount > 1 && (
                <div className="flex flex-col flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveImage(i, -1)}
                    disabled={i === 0}
                    className="w-8 py-1.5 flex items-center justify-center text-[#b07840] disabled:opacity-25 hover:text-[#b5541e] transition-colors rounded"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(i, 1)}
                    disabled={i === orderedImages.length - 1 && newExtraFiles.length === 0}
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
                onClick={() => removeOrderedImage(i)}
                disabled={orderedImages.length <= 1 && newExtraFiles.length === 0}
                className="w-9 h-9 flex items-center justify-center text-[#b07840] disabled:opacity-20 hover:text-[#b5541e] transition-colors rounded flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* New extras (not yet uploaded) */}
          {newExtraFiles.map((_, i) => (
            <div key={`new-${i}`} className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg overflow-hidden border-2 border-dashed border-[#b07840] flex-shrink-0 bg-[#fdf6e8]">
                {newExtraPreviews[i] ? (
                  <img src={newExtraPreviews[i]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[7px] text-[#a08060] font-bold">PDF</span>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={newExtraNames[i] ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewExtraNames((prev) => prev.map((n, ni) => ni === i ? val : n));
                }}
                placeholder={t('form.imageN').replace('{n}', String(orderedImages.length + i + 1))}
                className="flex-1 min-w-0 border border-[#b07840] bg-[#fdf6e8] rounded-md px-2.5 py-1.5 text-xs text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
              />
              <button
                type="button"
                onClick={() => removeNewExtra(i)}
                className="w-9 h-9 flex items-center justify-center text-[#b07840] hover:text-[#b5541e] transition-colors rounded flex-shrink-0"
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
