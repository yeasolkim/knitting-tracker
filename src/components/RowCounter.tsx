'use client';

import { useState } from 'react';

interface RowCounterProps {
  current: number;
  total: number;
  onChange: (row: number) => void;
}

export default function RowCounter({ current, total, onChange }: RowCounterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current <= 0}
        className="w-11 h-11 rounded-xl bg-gray-100 text-gray-600 text-xl font-bold flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="단 감소"
      >
        −
      </button>
      <div className="text-center min-w-[80px]" onClick={startEdit}>
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
            className="w-16 text-2xl font-bold text-gray-800 text-center border-b-2 border-rose-400 outline-none bg-transparent"
            min={0}
          />
        ) : (
          <div className="text-2xl font-bold text-gray-800 cursor-pointer hover:text-rose-500 transition-colors">
            {current}
          </div>
        )}
        <div className="text-xs text-gray-400">/ {total}단</div>
      </div>
      <button
        onClick={() => onChange(current + 1)}
        className="w-11 h-11 rounded-xl bg-rose-400 text-white text-xl font-bold flex items-center justify-center hover:bg-rose-500 active:bg-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="단 증가"
      >
        +
      </button>
    </div>
  );
}
