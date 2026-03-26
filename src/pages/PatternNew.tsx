import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PatternType>('knitting');
  const [yarn, setYarn] = useState('');
  const [needle, setNeedle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(selectedFile));
    } else {
      setPreview(null);
    }
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    let createdPatternId: string | null = null;
    let uploadedUrls: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t('form.error.login'));
      const user = session.user;

      // 패턴 개수 한도 체크
      const { count } = await supabase.from('patterns').select('id', { count: 'exact', head: true });
      if ((count ?? 0) >= 8) throw new Error(t('form.error.patternLimit'));

      const isPdf = file.type === 'application/pdf';

      const thumbPromise = isPdf ? generatePdfThumbnail(file).catch(() => null) : null;

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

      const ext = file.name.split('.').pop();
      const path = `${user.id}/${pattern.id}/${Date.now()}.${ext}`;

      // Get presigned URL from edge function, then upload directly to R2
      const presignRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-presign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ path, contentType: file.type }),
        }
      );
      if (!presignRes.ok) throw new Error(t('form.error.presign'));
      const { presignedUrl, fileUrl } = await presignRes.json();

      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(t('form.error.upload'));
      uploadedUrls.push(fileUrl); // track for cleanup on failure

      let thumbnailUrl: string | null = null;

      if (isPdf) {
        const thumbBlob = await thumbPromise;
        if (thumbBlob) {
          try {
            const thumbPath = `${user.id}/${pattern.id}/thumb.jpg`;
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
              if (thumbUpload.ok) {
                thumbnailUrl = thumbFileUrl;
                uploadedUrls.push(thumbFileUrl); // track for cleanup on failure
              }
            }
          } catch {
            // Thumbnail upload failed, proceed without
          }
        }
      } else {
        thumbnailUrl = fileUrl;
      }

      const [updateResult, progressResult] = await Promise.all([
        supabase
          .from('patterns')
          .update({
            file_url: fileUrl,
            thumbnail_url: thumbnailUrl,
            file_size: file.size,
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

      createdPatternId = null; // 성공 — cleanup 불필요
      uploadedUrls = [];
      navigate(`/patterns/${pattern.id}`);
    } catch (err) {
      // DB 레코드 정리
      if (createdPatternId) {
        const pid = createdPatternId;
        Promise.all([
          supabase.from('pattern_progress').delete().eq('pattern_id', pid),
          supabase.from('patterns').delete().eq('id', pid),
        ]).catch(() => {});
      }
      // R2 업로드된 파일 정리
      if (uploadedUrls.length > 0) {
        supabase.functions.invoke('r2-delete', { body: { urls: uploadedUrls } }).catch(() => {});
      }
      setError(err instanceof Error ? err.message : t('form.error.generic'));
      setUploading(false);
    }
  };

  if (uploading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <YarnLoader text={t('form.uploading')} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!file ? (
        <FileDropZone onFileSelect={handleFileSelect} />
      ) : (
        <div className="space-y-2.5">
          <div className="bg-[#fdf6e8] rounded-xl p-4 border-2 border-[#b07840]">
            {preview ? (
              <img
                src={preview}
                alt={t('form.previewAlt')}
                className="max-h-52 mx-auto rounded-lg object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-28 gap-3">
                <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                  <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                  <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
                <p className="text-sm text-[#a08060] truncate max-w-[200px]">{file.name}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setFile(null); setPreview(null); }}
            className="text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors tracking-wide"
          >
            {t('form.fileChange')}
          </button>
        </div>
      )}

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
        disabled={!file || !title || uploading}
        className="w-full bg-[#b5541e] text-[#fdf6e8] py-3 min-h-[48px] rounded-lg text-sm font-bold tracking-widest uppercase hover:bg-[#9a4318] disabled:opacity-40 disabled:cursor-not-allowed transition-all border-2 border-[#9a4318] shadow-[3px_3px_0_#9a4318] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
      >
        {uploading ? t('form.uploading') : t('form.save')}
      </button>
    </form>
  );
}
