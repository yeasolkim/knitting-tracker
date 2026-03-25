import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RowCounterProps {
  current: number;
  total: number;
  onChange: (row: number) => void;
}

export default function RowCounter({ current, total, onChange }: RowCounterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const { t } = useLanguage();

  const startEdit = () => {
    setEditValue(String(current));
    setIsEditing(true);
  };

  const commitEdit = () => {
    const val = parseInt(editValue);
    if (!isNaN(val) && val >= 0) {
      onChange(val);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current <= 0}
        className="w-11 h-11 rounded-lg border-2 border-[#c4a07a] bg-[#f5edd6] text-[#7a5c46] text-xl font-bold flex items-center justify-center hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#ede5cc] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="단 감소"
      >
        −
      </button>
      <div className="text-center min-w-[60px] sm:min-w-[80px]" onClick={startEdit}>
        {isEditing ? (
          <input
            autoFocus
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="w-14 sm:w-16 text-xl sm:text-2xl font-bold text-[#3d2b1f] text-center border-b-2 border-[#b5541e] outline-none bg-transparent"
            min={0}
          />
        ) : (
          <div className="text-xl sm:text-2xl font-bold text-[#3d2b1f] cursor-pointer hover:text-[#b5541e] transition-colors">
            {current}
          </div>
        )}
        <div className="text-[10px] sm:text-xs text-[#a08060] tracking-wide">{t('counter.rowOf', { total })}</div>
      </div>
      <button
        onClick={() => onChange(current + 1)}
        className="w-11 h-11 rounded-lg border-2 border-[#9a4318] bg-[#b5541e] text-[#fdf6e8] text-xl font-bold flex items-center justify-center hover:bg-[#9a4318] active:bg-[#7a3510] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-[2px_2px_0_#9a4318]"
        aria-label="단 증가"
      >
        +
      </button>
    </div>
  );
}
