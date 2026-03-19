import { useCallback, useState, useRef } from 'react';

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
}

export default function FileDropZone({
  onFileSelect,
  accept = 'image/*,.pdf',
  maxSizeMB = 10,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null);

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`파일 크기는 ${maxSizeMB}MB 이하여야 합니다.`);
        return;
      }

      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        setError('이미지 또는 PDF 파일만 업로드할 수 있습니다.');
        return;
      }

      onFileSelect(file);
    },
    [onFileSelect, maxSizeMB]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  return (
    <div>
      <div
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
          ${isDragOver ? 'border-rose-400 bg-rose-50' : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50/50'}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-4xl mb-3">📁</div>
        <p className="text-gray-600 font-medium mb-1">
          파일을 드래그하거나 클릭하여 선택
        </p>
        <p className="text-sm text-gray-400">
          이미지 또는 PDF (최대 {maxSizeMB}MB)
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
