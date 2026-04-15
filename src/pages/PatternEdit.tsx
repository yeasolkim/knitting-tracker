import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { ExtraPatternFile, PatternType } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import FileDropZone from '@/components/FileDropZone';
import YarnLoader from '@/components/YarnLoader';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PatternType>('knitting');
  const [yarn, setYarn] = useState('');
  const [needle, setNeedle] = useState('');
  const [currentFileUrl, setCurrentFileUrl] = useState('');
  const [currentFileType, setCurrentFileType] = useState<'image' | 'pdf'>('image');
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(null);

  // Existing extra images from DB
  const [currentExtraFiles, setCurrentExtraFiles] = useState<ExtraPatternFile[]>([]);
  // Extra files to delete (URLs)
  const [extraToDelete, setExtraToDelete] = useState<string[]>([]);
  // New extra files to upload
  const [newExtraFiles, setNewExtraFiles] = useState<File[]>([]);
  const [newExtraPreviews, setNewExtraPreviews] = useState<string[]>([]);

  const extraInputRef = useRef<HTMLInputElement>(null);

  // New primary file (optional replacement)
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Block in-app route changes (browser back button, link clicks) when there are unsaved changes
  const blocker = useBlocker(isDirty && !saving);
  useEffect(() => {
    if (blocker.state === 'blocked') setShowLeaveConfirm(true);
  }, [blocker.state]);

  // Warn on browser tab close / hard refresh when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    supabase
      .from('patterns')
      .select('*')
      .eq('id', id!)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { navigate('/dashboard'); return; }
        setTitle(data.title);
        setType(data.type as PatternType);
        setYarn(data.yarn || '');
        setNeedle(data.needle || '');
        setCurrentFileUrl(data.file_url);
        setCurrentFileType(data.file_type as 'image' | 'pdf');
        setCurrentThumbnailUrl(data.thumbnail_url);
        setCurrentExtraFiles((data.extra_image_urls as ExtraPatternFile[]) || []);
        setLoading(false);
      });
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
      f.type.startsWith('image/')
    );
    if (selected.length === 0) return;
    const newPreviews = selected.map((f) => URL.createObjectURL(f));
    setNewExtraFiles((prev) => [...prev, ...selected]);
    setNewExtraPreviews((prev) => [...prev, ...newPreviews]);
    setIsDirty(true);
    e.target.value = '';
  };

  const removeCurrentExtra = (index: number) => {
    const removed = currentExtraFiles[index];
    setExtraToDelete((prev) => [...prev, removed.url]);
    if (removed.thumbnail_url && removed.thumbnail_url !== removed.url) {
      setExtraToDelete((prev) => [...prev, removed.thumbnail_url!]);
    }
    setCurrentExtraFiles((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const removeNewExtra = (index: number) => {
    const url = newExtraPreviews[index];
    if (url) URL.revokeObjectURL(url);
    setNewExtraFiles((prev) => prev.filter((_, i) => i !== index));
    setNewExtraPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t('form.error.login'));

      let fileUrl = currentFileUrl;
      let fileType = currentFileType;
      let thumbnailUrl = currentThumbnailUrl;
      const urlsToDelete: string[] = [...extraToDelete];

      // Upload new primary file if replaced
      if (newFile) {
        const isPdf = newFile.type === 'application/pdf';
        const thumbPromise = isPdf ? generatePdfThumbnail(newFile).catch(() => null) : null;

        const uploadedUrl = await uploadFile(supabase, newFile, session.user.id, id!, t);
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

        // Mark old primary file for deletion
        const newUrls = new Set([fileUrl, thumbnailUrl].filter(Boolean));
        [currentFileUrl, currentThumbnailUrl]
          .filter((u): u is string => !!u && !newUrls.has(u))
          .forEach((u) => urlsToDelete.push(u));
      }

      // Upload new extra images
      const uploadedExtraFiles: ExtraPatternFile[] = [];
      for (let i = 0; i < newExtraFiles.length; i++) {
        const extraFile = newExtraFiles[i];
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

        uploadedExtraFiles.push({
          url: extraUrl,
          thumbnail_url: extraThumbUrl,
          file_type: isExtraPdf ? 'pdf' : 'image',
        });
      }

      const finalExtraImageUrls: ExtraPatternFile[] = [
        ...currentExtraFiles,
        ...uploadedExtraFiles,
      ];

      const { error: updateError } = await supabase
        .from('patterns')
        .update({
          title, type, yarn, needle,
          file_url: fileUrl, file_type: fileType, thumbnail_url: thumbnailUrl,
          extra_image_urls: finalExtraImageUrls,
          ...(newFile ? { file_size: newFile.size } : {}),
        })
        .eq('id', id!);

      if (updateError) throw updateError;

      // Delete removed files (fire-and-forget)
      const uniqueToDelete = [...new Set(urlsToDelete)].filter(Boolean);
      if (uniqueToDelete.length > 0) {
        supabase.functions.invoke('r2-delete', { body: { urls: uniqueToDelete } }).catch(() => {});
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

  const displayThumb = newPreview || (newFile ? null : (currentThumbnailUrl || (currentFileType === 'image' ? currentFileUrl : null)));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-7">
        {showLeaveConfirm ? (
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs text-[#7a5c46]">{t('edit.unsavedWarning')}</span>
            <button
              type="button"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed();
                else navigate(`/patterns/${id}`);
              }}
              className="text-xs font-bold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] rounded-lg px-2.5 py-1 min-h-[36px] hover:bg-[#9a4318] transition-colors"
            >
              {t('edit.unsavedLeave')}
            </button>
            <button
              type="button"
              onClick={() => { blocker.reset?.(); setShowLeaveConfirm(false); }}
              className="text-xs text-[#a08060] hover:text-[#3d2b1f] transition-colors min-h-[36px] px-1"
            >
              {t('card.cancel')}
            </button>
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
                  <p className="text-sm text-[#a08060] truncate max-w-[200px]">{newFile.name}</p>
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
                  <p className="text-sm text-[#a08060]">{currentFileType === 'pdf' ? t('form.filePdf') : t('form.fileImage')}</p>
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

      {/* Extra images section */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.extraImagesLabel')}
          {(currentExtraFiles.length + newExtraFiles.length) > 0 && (
            <span className="ml-1.5 text-[#a08060] normal-case font-normal tracking-normal">
              ({currentExtraFiles.length + newExtraFiles.length})
            </span>
          )}
        </label>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {/* Existing extra images from DB */}
          {currentExtraFiles.map((f, i) => (
            <div key={`cur-${i}`} className="relative aspect-square rounded-xl overflow-hidden border-2 border-[#b07840] bg-[#fdf6e8]">
              <img
                src={f.thumbnail_url || f.url}
                alt={`extra ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1 left-1 w-5 h-5 bg-[#3d2b1f]/65 rounded-full text-[#fdf6e8] text-[10px] font-bold flex items-center justify-center leading-none">
                {i + 1}
              </div>
              <button
                type="button"
                onClick={() => removeCurrentExtra(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-[#b5541e] text-[#fdf6e8] rounded-full text-xs flex items-center justify-center leading-none font-bold hover:bg-[#9a4318] transition-colors opacity-80 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}

          {/* New extra images (not yet uploaded) */}
          {newExtraFiles.map((_, i) => (
            <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden border-2 border-dashed border-[#b07840] bg-[#fdf6e8]">
              <img
                src={newExtraPreviews[i]}
                alt={`new extra ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-1 left-1 w-5 h-5 bg-[#3d2b1f]/65 rounded-full text-[#fdf6e8] text-[10px] font-bold flex items-center justify-center leading-none">
                {currentExtraFiles.length + i + 1}
              </div>
              <button
                type="button"
                onClick={() => removeNewExtra(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-[#b5541e] text-[#fdf6e8] rounded-full text-xs flex items-center justify-center leading-none font-bold hover:bg-[#9a4318] transition-colors opacity-80 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}

          {/* Add more card */}
          <button
            type="button"
            onClick={() => extraInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-[#b07840] flex flex-col items-center justify-center gap-1 bg-[#fdf6e8] hover:border-[#b5541e] hover:bg-[#f5edd6] transition-colors"
          >
            <span className="text-xl font-light text-[#b07840]">+</span>
            <span className="text-[9px] text-[#a08060] tracking-wide">{t('form.addMoreImages')}</span>
          </button>
        </div>

        <input
          ref={extraInputRef}
          type="file"
          accept="image/*"
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
