import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternType } from '@/lib/types';
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
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
  });
}

export default function PatternEdit() {
  return (
    <AuthGuard>
      {(user) => (
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

  // New file (optional replacement)
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setLoading(false);
      });
  }, [id, navigate, supabase]);

  const handleFileSelect = (selectedFile: File) => {
    setNewFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      setNewPreview(URL.createObjectURL(selectedFile));
    } else {
      setNewPreview(null);
    }
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

      // If a new file was selected, upload it
      if (newFile) {
        const isPdf = newFile.type === 'application/pdf';
        const thumbPromise = isPdf ? generatePdfThumbnail(newFile).catch(() => null) : null;

        const ext = newFile.name.split('.').pop();
        const path = `${session.user.id}/${id}/${Date.now()}.${ext}`;

        const presignRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-presign`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ path, contentType: newFile.type }),
          }
        );
        if (!presignRes.ok) throw new Error(t('form.error.presign'));
        const { presignedUrl, fileUrl: uploadedUrl } = await presignRes.json();

        const uploadRes = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': newFile.type },
          body: newFile,
        });
        if (!uploadRes.ok) throw new Error(t('form.error.upload'));

        fileUrl = uploadedUrl;
        fileType = isPdf ? 'pdf' : 'image';

        if (isPdf) {
          const thumbBlob = await thumbPromise;
          if (thumbBlob) {
            try {
              const thumbPath = `${session.user.id}/${id}/thumb_${Date.now()}.jpg`;
              const thumbPresignRes = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-presign`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ path: thumbPath, contentType: 'image/jpeg' }),
                }
              );
              if (thumbPresignRes.ok) {
                const { presignedUrl: thumbPresigned, fileUrl: thumbFileUrl } = await thumbPresignRes.json();
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

      const { error: updateError } = await supabase
        .from('patterns')
        .update({
          title, type, yarn, needle,
          file_url: fileUrl, file_type: fileType, thumbnail_url: thumbnailUrl,
          ...(newFile ? { file_size: newFile.size } : {}),
        })
        .eq('id', id!);

      if (updateError) throw updateError;

      // 파일이 교체된 경우 기존 R2 파일 삭제
      if (newFile) {
        const newUrls = new Set([fileUrl, thumbnailUrl].filter(Boolean));
        const oldUrls = [currentFileUrl, currentThumbnailUrl]
          .filter((u): u is string => !!u && !newUrls.has(u));
        const toDelete = [...new Set(oldUrls)];
        if (toDelete.length > 0) {
          fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ urls: toDelete }),
            },
          ).catch(() => {});
        }
      }

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

  // Thumbnail to display: new preview > current thumbnail > current file (if image)
  const displayThumb = newPreview || (newFile ? null : (currentThumbnailUrl || (currentFileType === 'image' ? currentFileUrl : null)));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="mb-7">
        <Link
          to={`/patterns/${id}`}
          className="inline-flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] min-h-[44px] transition-colors tracking-wide font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {t('form.backToPattern')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] mt-1 tracking-tight">{t('form.titleEdit')}</h1>
      </div>

      {/* File section */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.file')}
        </label>
        {newFile ? (
          <div className="space-y-2.5">
            <div className="bg-[#eef8f5] rounded-xl p-4 border-2 border-[#78b0a8]">
              {newPreview ? (
                <img src={newPreview} alt="미리보기" className="max-h-52 mx-auto rounded-lg object-contain" />
              ) : (
                <div className="flex items-center justify-center h-28 gap-3">
                  <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                    <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#78b0a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#78b0a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  </svg>
                  <p className="text-sm text-[#a08060] truncate max-w-[200px]">{newFile.name}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setNewFile(null); setNewPreview(null); }}
              className="text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors tracking-wide"
            >
              {t('form.fileCancelReplace')}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Current file preview */}
            <div className="bg-[#eef8f5] rounded-xl p-4 border-2 border-[#78b0a8]">
              {displayThumb ? (
                <img src={displayThumb} alt="현재 파일" className="max-h-52 mx-auto rounded-lg object-contain" />
              ) : (
                <div className="flex items-center justify-center h-28 gap-3">
                  <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                    <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#78b0a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#78b0a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
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

      {/* Title */}
      <div>
        <label className="block text-[11px] font-bold tracking-widest uppercase text-[#7a5c46] mb-2">
          {t('form.name')}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full border-2 border-[#78b0a8] bg-[#eef8f5] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
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
                  ? 'border-[#b5541e] bg-[#b5541e] text-[#eef8f5]'
                  : 'border-[#78b0a8] bg-[#eef8f5] text-[#7a5c46] hover:border-[#b5541e]'
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
          className="w-full border-2 border-[#78b0a8] bg-[#eef8f5] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
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
          className="w-full border-2 border-[#78b0a8] bg-[#eef8f5] rounded-lg px-4 py-2.5 text-sm text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] transition-colors"
          placeholder={t('form.needlePlaceholder')}
        />
      </div>

      {error && <p className="text-sm text-[#b5541e] font-medium">{error}</p>}

      <button
        type="submit"
        disabled={!title || saving}
        className="w-full bg-[#b5541e] text-[#eef8f5] py-3 min-h-[48px] rounded-lg text-sm font-bold tracking-widest uppercase hover:bg-[#9a4318] disabled:opacity-40 disabled:cursor-not-allowed transition-all border-2 border-[#9a4318] shadow-[3px_3px_0_#9a4318] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
      >
        {saving ? t('form.saving') : t('form.save')}
      </button>
    </form>
  );
}
