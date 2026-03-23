import { useCallback, useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

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
  const { t } = useLanguage();

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null);

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(t('dropzone.errorSize').replace('{max}', String(maxSizeMB)));
        return;
      }

      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        setError(t('dropzone.errorType'));
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
          border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all min-h-[140px] flex flex-col items-center justify-center
          ${isDragOver
            ? 'border-[#b5541e] bg-[#fdf6e8]'
            : 'border-[#d4b896] bg-[#fdf6e8] hover:border-[#b5541e] hover:bg-[#f5edd6]'
          }
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {/* Knit icon */}
        <div className="mb-4">
          <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
            <path d="M0,12 L9,0 L18,12 L27,0 L36,12" stroke={isDragOver ? '#b5541e' : '#d4b896'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M0,24 L9,12 L18,24 L27,12 L36,24" stroke={isDragOver ? '#b5541e' : '#d4b896'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <p className="text-sm font-semibold text-[#3d2b1f] mb-1 tracking-wide">
          {t('dropzone.label')}
        </p>
        <p className="text-xs text-[#a08060] tracking-wide">
          {t('dropzone.hint').replace('{max}', String(maxSizeMB))}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {error && <p className="mt-2 text-xs text-[#b5541e] font-medium">{error}</p>}
    </div>
  );
}
