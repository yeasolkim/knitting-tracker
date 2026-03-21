import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PatternWithProgress, SubPattern } from '@/lib/types';

interface PatternCardProps {
  pattern: PatternWithProgress;
  onDelete: (id: string) => void;
}

const PatternCard = memo(function PatternCard({ pattern, onDelete }: PatternCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const subPatterns = (pattern.progress?.sub_patterns as SubPattern[]) || [];
  const totalRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.total_rows || 0), 0)
    : pattern.total_rows;
  const currentRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.current_row || 0), 0)
    : pattern.progress?.current_row || 0;

  const progress = totalRows > 0 ? Math.min(100, (currentRows / totalRows) * 100) : 0;
  const typeLabel = pattern.type === 'crochet' ? '코바늘' : '대바늘';

  return (
    <div className="bg-[#fdf6e8] rounded-xl border-2 border-[#d4b896] overflow-hidden hover:shadow-[4px_4px_0_#d4b896] transition-all group relative">
      {/* Thumbnail */}
      <Link to={`/patterns/${pattern.id}`}>
        <div className="aspect-[4/3] bg-[#f5edd6] relative overflow-hidden border-b-2 border-[#d4b896]">
          {pattern.thumbnail_url || pattern.file_type === 'image' ? (
            <img
              src={pattern.thumbnail_url || pattern.file_url}
              alt={pattern.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg width="32" height="22" viewBox="0 0 28 18" fill="none">
                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#d4b896" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#d4b896" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
          )}
          {/* Type badge */}
          <span className="absolute top-2 left-2 text-[9px] font-bold tracking-widest uppercase bg-[#3d2b1f] text-[#fdf6e8] px-2 py-0.5 rounded">
            {typeLabel}
          </span>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-2.5">
          <Link to={`/patterns/${pattern.id}`} className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-[#3d2b1f] line-clamp-1 tracking-tight group-hover:text-[#b5541e] transition-colors">
              {pattern.title}
            </h3>
            {(pattern.yarn || pattern.needle) && (
              <p className="text-[10px] text-[#a08060] mt-0.5 line-clamp-1 tracking-wide">
                {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
              </p>
            )}
          </Link>

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onDelete(pattern.id)}
                className="text-[10px] text-[#fdf6e8] bg-[#b5541e] hover:bg-[#9a4318] px-1.5 py-0.5 rounded font-semibold tracking-wide transition-colors"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-[#a08060] hover:text-[#7a5c46] px-1.5 py-0.5 transition-colors"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); setConfirmDelete(true); }}
              className="text-[#d4b896] hover:text-[#b5541e] transition-colors p-1 shrink-0 -mr-1 -mt-0.5"
              aria-label="삭제"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#7a5c46] font-semibold tracking-wide">{currentRows}단</span>
            <span className="text-[10px] text-[#a08060] tracking-wide">/ {totalRows}단</span>
          </div>
          <div className="h-1.5 bg-[#f5edd6] border border-[#d4b896] rounded-full overflow-hidden">
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
