import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PatternWithProgress, SubPattern } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

function fmtSize(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

interface PatternCardProps {
  pattern: PatternWithProgress;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
  duplicating?: boolean;
}

const PatternCard = memo(function PatternCard({ pattern, onDelete, onDuplicate, duplicating = false }: PatternCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const { t } = useLanguage();

  const subPatterns = (pattern.progress?.sub_patterns as SubPattern[]) || [];
  const totalRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.total_rows || 0), 0)
    : pattern.total_rows;
  const currentRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.current_row || 0), 0)
    : pattern.progress?.current_row || 0;

  const progress = totalRows > 0 ? Math.min(100, (currentRows / totalRows) * 100) : 0;
  const typeLabel = pattern.type === 'crochet' ? t('card.type.crochet') : t('card.type.knitting');

  return (
    <div className="bg-[#fdf6e8] rounded-xl border-2 border-[#b07840] overflow-hidden hover:shadow-[4px_4px_0_#b07840] transition-all group relative">
      {/* Thumbnail */}
      <Link to={`/patterns/${pattern.id}`}>
        <div className="aspect-[4/3] bg-[#f5edd6] relative overflow-hidden border-b-2 border-[#b07840]">
          {!imgFailed && (pattern.thumbnail_url || pattern.file_type === 'image') ? (
            <img
              src={pattern.thumbnail_url || pattern.file_url}
              alt={pattern.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 transform-gpu"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (pattern.thumbnail_url && img.src !== pattern.file_url) {
                  img.src = pattern.file_url;
                } else {
                  setImgFailed(true);
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
              <svg width="32" height="22" viewBox="0 0 28 18" fill="none">
                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              {pattern.file_type === 'pdf' && (
                <span className="text-[9px] text-[#a08060] font-medium">
                  PDF{fmtSize(pattern.file_size) ? ` · ${fmtSize(pattern.file_size)}` : ''}
                </span>
              )}
              {imgFailed && pattern.file_type === 'image' && (
                <span className="text-[9px] text-[#c08060] font-medium">{t('viewer.imageLoadError').split('\n')[0]}</span>
              )}
            </div>
          )}
          {/* Type badge */}
          <span className="absolute top-2 left-2 text-[9px] font-bold tracking-widest uppercase bg-[#3d2b1f] text-[#fdf6e8] px-2 py-0.5 rounded">
            {typeLabel}
          </span>
          {/* Extra image count badge */}
          {(pattern.extra_image_urls?.length ?? 0) > 0 && (
            <span className="absolute top-2 right-2 text-[9px] font-bold bg-[#b07840]/80 text-[#fdf6e8] px-1.5 py-0.5 rounded">
              {t('card.imageCount').replace('{n}', String(pattern.extra_image_urls!.length))}
            </span>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-2.5">
          <Link to={`/patterns/${pattern.id}`} className="min-w-0 flex-1">
            <h3
              title={pattern.title}
              className="font-semibold text-sm text-[#3d2b1f] line-clamp-1 tracking-tight group-hover:text-[#b5541e] transition-colors"
            >
              {pattern.title}
            </h3>
            {(pattern.yarn || pattern.needle) && (
              <p
                title={[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
                className="text-[10px] text-[#a08060] mt-0.5 line-clamp-1 tracking-wide"
              >
                {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
              </p>
            )}
          </Link>

          {/* Edit / Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                disabled={deleting}
                onClick={async () => {
                  if (deleting) return;
                  setDeleting(true);
                  await onDelete(pattern.id);
                }}
                className="text-[10px] text-[#fdf6e8] bg-[#b5541e] hover:bg-[#9a4318] px-1.5 py-0.5 rounded font-semibold tracking-wide transition-colors disabled:opacity-50"
              >
                {deleting ? '…' : t('card.delete')}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-[#a08060] hover:text-[#7a5c46] px-1.5 py-0.5 transition-colors"
              >
                {t('card.cancel')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 shrink-0">
              {onDuplicate && (
                <button
                  onClick={(e) => { e.preventDefault(); if (!duplicating) onDuplicate(pattern.id); }}
                  disabled={duplicating}
                  className="text-[#b07840] hover:text-[#7a5c46] transition-colors p-2 min-w-[36px] min-h-[36px] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={t('card.duplicate')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              )}
              <Link
                to={`/patterns/${pattern.id}/edit`}
                onClick={(e) => e.stopPropagation()}
                className="text-[#b07840] hover:text-[#7a5c46] transition-colors p-2 min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label={t('card.edit')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </Link>
              <button
                onClick={(e) => { e.preventDefault(); setConfirmDelete(true); }}
                className="text-[#b07840] hover:text-[#b5541e] transition-colors p-2 min-w-[36px] min-h-[36px] flex items-center justify-center"
                aria-label={t('card.delete')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#7a5c46] font-semibold tracking-wide">{t('card.rowCurrent', { n: currentRows })}</span>
            <span className="text-[10px] text-[#a08060] tracking-wide">{t('card.rowTotal', { n: totalRows })}</span>
          </div>
          <div className="h-1.5 bg-[#f5edd6] border border-[#b07840] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#b5541e] rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PatternCard;
