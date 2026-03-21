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
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group relative">
      {/* Thumbnail */}
      <Link to={`/patterns/${pattern.id}`}>
        <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
          {pattern.thumbnail_url || pattern.file_type === 'image' ? (
            <img
              src={pattern.thumbnail_url || pattern.file_url}
              alt={pattern.title}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          )}
          {/* Type badge */}
          <span className="absolute top-2 left-2 text-[10px] font-medium bg-black/40 text-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full">
            {typeLabel}
          </span>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-2.5">
          <Link to={`/patterns/${pattern.id}`} className="min-w-0 flex-1">
            <h3 className="font-medium text-sm text-gray-900 line-clamp-1 group-hover:text-rose-500 transition-colors">
              {pattern.title}
            </h3>
            {(pattern.yarn || pattern.needle) && (
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">
                {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
              </p>
            )}
          </Link>

          {/* Delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onDelete(pattern.id)}
                className="text-[10px] text-white bg-red-400 hover:bg-red-500 px-1.5 py-0.5 rounded-full transition-colors"
              >
                삭제
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 transition-colors"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.preventDefault(); setConfirmDelete(true); }}
              className="text-gray-200 hover:text-red-300 transition-colors p-1 shrink-0 -mr-1 -mt-0.5"
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
            <span className="text-[10px] text-gray-400">{currentRows}단</span>
            <span className="text-[10px] text-gray-300">/ {totalRows}단</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-rose-300 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PatternCard;
