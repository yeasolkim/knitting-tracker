import { useCallback, useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface FileDropZoneProps {
  onFileSelect?: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
}

export default function FileDropZone({
  onFileSelect,
  onFilesSelect,
  multiple = false,
  accept = 'image/*,.pdf',
  maxSizeMB = 10,
  label,
  hint,
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useLanguage();

  const showError = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(msg);
    errorTimerRef.current = setTimeout(() => setError(null), 5000);
  }, []);

  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); }, []);

  const validateFile = useCallback(
    (file: File): boolean => {
      if (file.size > maxSizeMB * 1024 * 1024) {
        showError(t('dropzone.errorSize').replace('{max}', String(maxSizeMB)));
        return false;
      }
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        showError(t('dropzone.errorType'));
        return false;
      }
      return true;
    },
    [maxSizeMB, t]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setError(null);

      if (multiple && onFilesSelect) {
        const valid = Array.from(fileList).filter(validateFile);
        if (valid.length > 0) onFilesSelect(valid);
      } else {
        const file = fileList[0];
        if (validateFile(file) && onFileSelect) onFileSelect(file);
      }
    },
    [multiple, onFilesSelect, onFileSelect, validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      e.target.value = '';
    },
    [handleFiles]
  );

  const displayLabel = label ?? t('dropzone.label');
  const displayHint = hint ?? t('dropzone.hint').replace('{max}', String(maxSizeMB));

  return (
    <div>
      <div
        className={`
          border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all min-h-[140px] flex flex-col items-center justify-center
          ${isDragOver
            ? 'border-[#b5541e] bg-[#fdf6e8]'
            : 'border-[#b07840] bg-[#fdf6e8] hover:border-[#b5541e] hover:bg-[#f5edd6]'
          }
        `}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="mb-4">
          <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
            <path d="M0,12 L9,0 L18,12 L27,0 L36,12" stroke={isDragOver ? '#b5541e' : '#b07840'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M0,24 L9,12 L18,24 L27,12 L36,24" stroke={isDragOver ? '#b5541e' : '#b07840'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
        <p className="text-sm font-semibold text-[#3d2b1f] mb-1 tracking-wide">{displayLabel}</p>
        <p className="text-xs text-[#a08060] tracking-wide">{displayHint}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </div>
      {error && <p className="mt-2 text-xs text-[#b5541e] font-medium">{error}</p>}
    </div>
  );
}
