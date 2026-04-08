import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { ExtraPatternFile, PatternType } from '@/lib/types';
import type { TranslationKey } from '@/lib/i18n';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
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

export default function PatternNew() {
  return (
    <AuthGuard>
      {(user) => (
        <div className="min-h-screen bg-[#faf9f7]">
          <Navbar userEmail={user.email} />
          <main className="max-w-lg mx-auto px-4 py-8 sm:py-12">
            <PatternNewHeader />
            <UploadForm />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}

function PatternNewHeader() {
  const { t } = useLanguage();
  return (
    <div className="mb-7">
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] min-h-[44px] transition-colors tracking-wide font-medium">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {t('form.backToList')}
      </Link>
      <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] mt-1 tracking-tight">{t('form.titleNew')}</h1>
    </div>
  );
}

function UploadForm() {
  const navigate = useNavigate();
  const supabase = createClient();
  const { t } = useLanguage();

  // All selected files: files[0] = primary, files[1+] = extras
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const addInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<PatternType>('knitting');
  const [yarn, setYarn] = useState('');
  const [needle, setNeedle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (incoming: File[]) => {
    const newPreviews = incoming.map((f) =>
      f.type.startsWith('image/') ? URL.createObjectURL(f) : ''
    );
    setFiles((prev) => {
      const updated = [...prev, ...incoming];
      if (updated.length === incoming.length && !title) {
        // first batch — auto-fill title from first file
        setTitle(incoming[0].name.replace(/\.[^.]+$/, ''));
      }
      return updated;
    });
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) addFiles(selected);
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    // Total upload steps: primary + optional pdf thumb + extras
    const primaryFile = files[0];
    const extraFilesList = files.slice(1);
    const isPdf = primaryFile.type === 'application/pdf';
    const totalSteps = 1 + (isPdf ? 1 : 0) + extraFilesList.length;
    setUploadTotal(totalSteps);
    setUploadStep(0);

    let createdPatternId: string | null = null;
    let uploadedUrls: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t('form.error.login'));
      const user = session.user;

      const { count } = await supabase.from('patterns').select('id', { count: 'exact', head: true });
      if ((count ?? 0) >= 20) throw new Error(t('form.error.patternLimit'));

      const thumbPromise = isPdf ? generatePdfThumbnail(primaryFile).catch(() => null) : null;

      const { data: pattern, error: insertError } = await supabase
        .from('patterns')
        .insert({
          user_id: user.id,
          title,
          type,
          file_url: '',
          file_type: isPdf ? 'pdf' : 'image',
          total_rows: 1,
          yarn,
          needle,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      createdPatternId = pattern.id;

      // Upload primary file
      const fileUrl = await uploadFile(supabase, primaryFile, user.id, pattern.id, t);
      uploadedUrls.push(fileUrl);
      setUploadStep(1);

      // Primary thumbnail
      let thumbnailUrl: string | null = null;
      if (isPdf) {
        const thumbBlob = await thumbPromise;
        if (thumbBlob) {
          try {
            const thumbPath = `${user.id}/${pattern.id}/thumb.jpg`;
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
              if (thumbUpload.ok) {
                thumbnailUrl = thumbFileUrl;
                uploadedUrls.push(thumbFileUrl);
              }
            }
          } catch {
            // thumbnail failed, proceed without
          }
        }
        setUploadStep(2);
      } else {
        thumbnailUrl = fileUrl;
      }

      // Upload extra images
      const extraImageUrls: ExtraPatternFile[] = [];
      for (let i = 0; i < extraFilesList.length; i++) {
        const extraUrl = await uploadFile(supabase, extraFilesList[i], user.id, pattern.id, t);
        uploadedUrls.push(extraUrl);
        extraImageUrls.push({ url: extraUrl, thumbnail_url: extraUrl });
        setUploadStep((isPdf ? 2 : 1) + i + 1);
      }

      const [updateResult, progressResult] = await Promise.all([
        supabase
          .from('patterns')
          .update({
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl,
            file_size: primaryFile.size,
            extra_image_urls: extraImageUrls,
          })
          .eq('id', pattern.id),
        supabase.from('pattern_progress').insert({
          pattern_id: pattern.id,
          user_id: user.id,
          current_row: 0,
          ruler_position_y: 50,
          ruler_height: 0,
          notes: {},
        }),
      ]);

      if (updateResult.error) throw updateResult.error;
      if (progressResult.error) throw progressResult.error;

      createdPatternId = null;
      uploadedUrls = [];
      navigate(`/patterns/${pattern.id}`);
    } catch (err) {
      if (createdPatternId) {
        const pid = createdPatternId;
        Promise.all([
          supabase.from('pattern_progress').delete().eq('pattern_id', pid),
          supabase.from('patterns').delete().eq('id', pid),
        ]).catch(() => {});
      }
      if (uploadedUrls.length > 0) {
        supabase.functions.invoke('r2-delete', { body: { urls: uploadedUrls } }).catch(() => {});
      }
      setError(err instanceof Error ? err.message : t('form.error.generic'));
      setUploading(false);
    }
  };

  if (uploading) {
    const progressText = uploadTotal > 1
      ? t('form.uploadProgress')
          .replace('{done}', String(uploadStep))
          .replace('{total}', String(uploadTotal))
      : t('form.uploading');
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <YarnLoader text={progressText} />
        {uploadTotal > 1 && (
          <div className="mt-4 w-48 h-1.5 bg-[#e8dcc8] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#b5541e] rounded-full transition-all duration-300"
              style={{ width: `${(uploadStep / uploadTotal) * 100}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* File picker section */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-1.5">
          {t('form.file')}
        </label>
        <p className="text-xs text-[#a08060] mb-3">
          {t('form.fileUploadTip')}
        </p>

        {/* Grid: empty slots (before) OR filled cards (after) */}
        <div
          className={`grid grid-cols-3 sm:grid-cols-4 gap-2 ${files.length === 0 ? 'cursor-pointer' : ''}`}
          onDragOver={files.length === 0 ? (e) => e.preventDefault() : undefined}
          onDrop={files.length === 0 ? (e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files).filter(f =>
              f.type.startsWith('image/') || f.type === 'application/pdf'
            );
            if (dropped.length > 0) addFiles(dropped);
          } : undefined}
        >
          {files.length === 0 ? (
            /* ── Empty state: placeholder slots ── */
            <>
              {/* Slot 1 – primary (active, clickable) */}
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-[#b07840] bg-[#fdf6e8] hover:border-[#b5541e] hover:bg-[#f5edd6] transition-colors flex flex-col items-center justify-center gap-1.5"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span className="text-[9px] font-bold text-[#b07840] tracking-wide">대표</span>
              </button>

              {/* Slots 2–4 – extras (greyed out, clickable) */}
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => addInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-[#d4c4a8] bg-[#faf9f7] hover:border-[#b07840] hover:bg-[#fdf6e8] transition-colors flex flex-col items-center justify-center gap-1.5 opacity-60 hover:opacity-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4a882" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <span className="text-[9px] text-[#c4a882]">{n}</span>
                </button>
              ))}
            </>
          ) : (
            /* ── Filled state: actual images ── */
            <>
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border-2 border-[#b07840] bg-[#fdf6e8]">
                  {previews[i] ? (
                    <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                      <svg width="24" height="16" viewBox="0 0 28 18" fill="none">
                        <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      <span className="text-[9px] text-[#a08060]">PDF</span>
                    </div>
                  )}
                  {/* Number badge */}
                  <div className="absolute top-1 left-1 w-5 h-5 bg-[#3d2b1f]/65 rounded-full text-[#fdf6e8] text-[10px] font-bold flex items-center justify-center leading-none">
                    {i + 1}
                  </div>
                  {/* Cover badge */}
                  {i === 0 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-[#b5541e]/80 text-[#fdf6e8] text-[9px] font-bold text-center py-0.5 tracking-widest uppercase">
                      {t('form.primaryBadge')}
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-[#b5541e] text-[#fdf6e8] rounded-full text-xs flex items-center justify-center leading-none font-bold hover:bg-[#9a4318] transition-colors opacity-80 hover:opacity-100"
                    aria-label="remove"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Add more card */}
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-[#b07840] flex flex-col items-center justify-center gap-1 bg-[#fdf6e8] hover:border-[#b5541e] hover:bg-[#f5edd6] transition-colors"
              >
                <span className="text-xl font-light text-[#b07840]">+</span>
                <span className="text-[9px] text-[#a08060] tracking-wide">{t('form.addMoreImages')}</span>
              </button>
            </>
          )}
        </div>

        {/* Helper text below grid */}
        {files.length === 0 && (
          <p className="text-[11px] text-[#a08060] text-center mt-2.5">
            {t('form.tapOrDrag')}
          </p>
        )}
        {files.length > 1 && (
          <p className="text-[11px] text-[#a08060] mt-2">{t('form.coverImageHint')}</p>
        )}
        {files.length > 0 && (
          <button
            type="button"
            onClick={() => { setFiles([]); setPreviews([]); }}
            className="mt-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors tracking-wide"
          >
            {t('form.resetFiles')}
          </button>
        )}

        <input
          ref={addInputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          className="hidden"
          onChange={handleAddMore}
        />
      </div>

      {/* Pattern name */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.name')}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
              onClick={() => setType(option.value)}
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
          onChange={(e) => setYarn(e.target.value)}
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
          onChange={(e) => setNeedle(e.target.value)}
          className="w-full border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.needlePlaceholder')}
        />
      </div>

      {error && <p className="text-sm text-[#b5541e] font-medium">{error}</p>}

      <button
        type="submit"
        disabled={files.length === 0 || !title || uploading}
        className="w-full bg-[#b5541e] text-[#fdf6e8] py-3 min-h-[48px] rounded-lg text-sm font-bold tracking-widest uppercase hover:bg-[#9a4318] disabled:opacity-40 disabled:cursor-not-allowed transition-all border-2 border-[#9a4318] shadow-[3px_3px_0_#9a4318] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
      >
        {uploading ? t('form.uploading') : t('form.save')}
      </button>
    </form>
  );
}
