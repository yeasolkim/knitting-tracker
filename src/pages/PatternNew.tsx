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
        <div className="min-h-screen bg-gray-50/50">
          <Navbar userEmail={user.email} />

          <main className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
            <div className="mb-6 sm:mb-8">
              <Link to="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-flex items-center min-h-[44px]">
                ← 대시보드로
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">새 도안 추가</h1>
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
      const { error: uploadError } = await supabase.storage
        .from('pattern-files')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('pattern-files')
        .getPublicUrl(path);

      let thumbnailUrl: string | null = null;

      if (isPdf) {
        const thumbBlob = await thumbPromise;
        if (thumbBlob) {
          try {
            const thumbPath = `${user.id}/${pattern.id}/thumb.jpg`;
            await supabase.storage.from('pattern-files').upload(thumbPath, thumbBlob, {
              contentType: 'image/jpeg',
            });
            const { data: thumbUrlData } = supabase.storage
              .from('pattern-files')
              .getPublicUrl(thumbPath);
            thumbnailUrl = thumbUrlData.publicUrl;
          } catch {
            // Thumbnail upload failed, proceed without
          }
        }
      } else {
        thumbnailUrl = urlData.publicUrl;
      }

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
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-5 sm:space-y-6">
      {!file ? (
        <FileDropZone onFileSelect={handleFileSelect} />
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            {preview ? (
              <img
                src={preview}
                alt="미리보기"
                className="max-h-48 mx-auto rounded-lg object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-400">
                <div className="text-center">
                  <div className="text-3xl mb-1">📄</div>
                  <p className="text-sm">{file.name}</p>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setFile(null);
              setPreview(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            다른 파일 선택
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
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
          placeholder="예: 봄 카디건"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          뜨개 종류
        </label>
        <div className="flex gap-3">
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
                  ? 'border-rose-400 bg-rose-50 text-rose-600'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          실
        </label>
        <input
          type="text"
          value={yarn}
          onChange={(e) => setYarn(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
          placeholder="예: 코튼 4합, 울 혼방"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          바늘
        </label>
        <input
          type="text"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300"
          placeholder="예: 4mm 대바늘, 3/0호 코바늘"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={!file || !title || uploading}
        className="w-full bg-rose-400 text-white py-3 min-h-[44px] rounded-xl font-medium hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? '업로드 중...' : '도안 추가'}
      </button>
    </form>
  );
}
