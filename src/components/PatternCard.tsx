import { memo } from 'react';
import { Link } from 'react-router-dom';
import type { PatternWithProgress, SubPattern } from '@/lib/types';
import ProgressBar from './ProgressBar';

interface PatternCardProps {
  pattern: PatternWithProgress;
  onDelete: (id: string) => void;
}

const PatternCard = memo(function PatternCard({ pattern, onDelete }: PatternCardProps) {
  const typeLabel = pattern.type === 'crochet' ? '코바늘' : '대바늘';

  const subPatterns = (pattern.progress?.sub_patterns as SubPattern[]) || [];
  const totalRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.total_rows || 0), 0)
    : pattern.total_rows;
  const currentRows = subPatterns.length > 0
    ? subPatterns.reduce((sum, s) => sum + (s.current_row || 0), 0)
    : pattern.progress?.current_row || 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow group">
      <Link to={`/patterns/${pattern.id}`}>
        <div className="aspect-[4/3] bg-gray-50 relative overflow-hidden">
          {pattern.thumbnail_url || pattern.file_type === 'image' ? (
            <img
              src={pattern.thumbnail_url || pattern.file_url}
              alt={pattern.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          )}
          <span className="absolute top-2 right-2 text-xs bg-white/90 text-gray-600 px-2 py-1 rounded-full">
            {typeLabel}
          </span>
        </div>
      </Link>

      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <Link to={`/patterns/${pattern.id}`}>
            <h3 className="font-medium text-gray-800 hover:text-rose-500 transition-colors line-clamp-1">
              {pattern.title}
            </h3>
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm('이 도안을 삭제하시겠습니까?')) {
                onDelete(pattern.id);
              }
            }}
            className="text-gray-300 hover:text-red-400 transition-colors ml-2 shrink-0"
            aria-label="삭제"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {subPatterns.length > 1 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {subPatterns.map((sub) => {
              const unit = '단';
              return (
                <span key={sub.id} className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                  {sub.name} {sub.current_row}/{sub.total_rows}{unit}
                </span>
              );
            })}
          </div>
        )}

        {(pattern.yarn || pattern.needle) && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pattern.yarn && (
              <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                🧶 {pattern.yarn}
              </span>
            )}
            {pattern.needle && (
              <span className="text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                🪡 {pattern.needle}
              </span>
            )}
          </div>
        )}
        <ProgressBar current={currentRows} total={totalRows} />
      </div>
    </div>
  );
});

export default PatternCard;
