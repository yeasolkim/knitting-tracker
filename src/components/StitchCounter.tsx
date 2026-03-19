import { useState } from 'react';

interface StitchCounterProps {
  count: number;
  onChange: (count: number) => void;
}

export default function StitchCounter({ count, onChange }: StitchCounterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
    setEditValue(String(count));
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
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="text-xs text-gray-400 mr-0.5 sm:mr-1">코</span>
      <button
        onClick={() => onChange(count - 1)}
        disabled={count <= 0}
        className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 transition-colors"
        aria-label="코 감소"
      >
        −
      </button>
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
          className="w-12 text-base sm:text-lg font-semibold text-gray-700 text-center border-b-2 border-violet-400 outline-none bg-transparent"
          min={0}
        />
      ) : (
        <span
          className="text-base sm:text-lg font-semibold text-gray-700 min-w-[36px] sm:min-w-[40px] text-center cursor-pointer hover:text-violet-500 transition-colors"
          onClick={startEdit}
        >
          {count}
        </span>
      )}
      <button
        onClick={() => onChange(count + 1)}
        className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-violet-100 text-violet-600 text-sm font-bold flex items-center justify-center hover:bg-violet-200 active:bg-violet-300 transition-colors"
        aria-label="코 증가"
      >
        +
      </button>
    </div>
  );
}
