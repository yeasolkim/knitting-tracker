import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternType } from '@/lib/types';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import FileDropZone from '@/components/FileDropZone';

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

export default function PatternNew() {
  return (
    <AuthGuard>
      {(user) => (
        <div className="min-h-screen bg-[#faf9f7]">
          <Navbar userEmail={user.email} />

          <main className="max-w-lg mx-auto px-4 py-8 sm:py-12">
            <div className="mb-7">
              <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 min-h-[44px] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                내 도안
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">도안 추가</h1>
            </div>

            <UploadForm />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}

function UploadForm() {
  const navigate = useNavigate();
  const supabase = createClient();
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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('로그인이 필요합니다.');
      const user = session.user;

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
      if (!presignRes.ok) throw new Error('파일 업로드 준비에 실패했습니다.');
      const { presignedUrl, fileUrl } = await presignRes.json();

      const uploadRes = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('파일 업로드에 실패했습니다.');

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
              if (thumbUpload.ok) thumbnailUrl = thumbFileUrl;
            }
          } catch {
            // Thumbnail upload failed, proceed without
          }
        }
      } else {
        thumbnailUrl = fileUrl;
      }

      const urlData = { publicUrl: fileUrl };

      await Promise.all([
        supabase
          .from('patterns')
          .update({
            file_url: urlData.publicUrl,
            thumbnail_url: thumbnailUrl,
          })
          .eq('id', pattern.id),
        supabase.from('pattern_progress').insert({
          pattern_id: pattern.id,
          user_id: user.id,
          current_row: 0,
          stitch_count: 0,
          ruler_position_y: 50,
          notes: {},
        }),
      ]);

      navigate(`/patterns/${pattern.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드에 실패했습니다.');
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!file ? (
        <FileDropZone onFileSelect={handleFileSelect} />
      ) : (
        <div className="space-y-3">
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            {preview ? (
              <img
                src={preview}
                alt="미리보기"
                className="max-h-52 mx-auto rounded-xl object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-28 gap-3 text-gray-400">
                <svg className="w-8 h-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-400 truncate max-w-[200px]">{file.name}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setFile(null); setPreview(null); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            다른 파일로 바꾸기
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          도안 이름
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full border border-gray-100 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 placeholder:text-gray-300"
          placeholder="예: 봄 카디건"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          종류
        </label>
        <div className="flex gap-2">
          {[
            { value: 'knitting' as const, label: '대바늘' },
            { value: 'crochet' as const, label: '코바늘' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                type === option.value
                  ? 'border-rose-400 bg-rose-50 text-rose-500'
                  : 'border-gray-100 bg-white text-gray-400 hover:border-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          실 <span className="text-gray-300 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={yarn}
          onChange={(e) => setYarn(e.target.value)}
          className="w-full border border-gray-100 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 placeholder:text-gray-300"
          placeholder="예: 코튼 4합, 울 혼방"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          바늘 <span className="text-gray-300 font-normal">(선택)</span>
        </label>
        <input
          type="text"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          className="w-full border border-gray-100 bg-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 placeholder:text-gray-300"
          placeholder="예: 4mm, 3/0호"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!file || !title || uploading}
        className="w-full bg-rose-400 text-white py-3 min-h-[44px] rounded-xl text-sm font-medium hover:bg-rose-500 active:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? '올리는 중...' : '저장하기'}
      </button>
    </form>
  );
}
