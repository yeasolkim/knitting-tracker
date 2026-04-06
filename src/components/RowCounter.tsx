import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RowCounterProps {
  current: number;
  total: number;
  onChange: (row: number) => void;
}

export default function RowCounter({ current, total, onChange }: RowCounterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [shake, setShake] = useState(false);
  const { t } = useLanguage();

  const longPressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressCountRef = useRef(0);
  const longPressFiredRef = useRef(false);
  // Keep mutable refs so the interval can read latest values
  const currentRef = useRef(current);
  const onChangeRef = useRef(onChange);
  currentRef.current = current;
  onChangeRef.current = onChange;

  const startEdit = () => {
    setEditValue(String(current));
    setIsEditing(true);
  };

  const commitEdit = () => {
    const val = parseInt(editValue);
    if (!isNaN(val) && val >= 0) {
      onChange(val);
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
    setIsEditing(false);
  };

  const startLongPress = (delta: number) => {
    longPressCountRef.current = 0;
    longPressFiredRef.current = false;
    longPressRef.current = setInterval(() => {
      longPressCountRef.current += 1;
      longPressFiredRef.current = true;
      const step = longPressCountRef.current > 10 ? 5 : 1;
      onChangeRef.current(Math.max(0, currentRef.current + delta * step));
    }, 120);
  };

  const stopLongPress = () => {
    if (longPressRef.current) {
      clearInterval(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      <button
        onClick={() => { if (!longPressFiredRef.current) onChange(Math.max(0, current - 1)); }}
        onPointerDown={() => startLongPress(-1)}
        onPointerUp={stopLongPress}
        onPointerLeave={stopLongPress}
        disabled={current <= 0}
        className="w-9 h-9 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-[#7a5c46] text-lg font-bold flex items-center justify-center hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#ede5cc] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={t('aria.rowDecrease')}
      >
        −
      </button>
      <div
        className={`text-center min-w-[40px] sm:min-w-[52px] ${shake ? 'animate-shake' : ''}`}
        onClick={startEdit}
      >
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
            className="w-12 sm:w-14 text-base sm:text-lg font-bold text-[#3d2b1f] text-center border-b-2 border-[#b5541e] outline-none bg-transparent"
            min={0}
          />
        ) : (
          <div className="text-base sm:text-lg font-bold text-[#3d2b1f] cursor-pointer hover:text-[#b5541e] transition-colors leading-tight">
            {current}
          </div>
        )}
        <div className="text-[9px] text-[#a08060] tracking-wide leading-tight">{t('counter.rowOf', { total })}</div>
      </div>
      <button
        onClick={() => { if (!longPressFiredRef.current) onChange(current + 1); }}
        onPointerDown={() => startLongPress(1)}
        onPointerUp={stopLongPress}
        onPointerLeave={stopLongPress}
        className="w-9 h-9 rounded-lg border-2 border-[#9a4318] bg-[#b5541e] text-[#fdf6e8] text-lg font-bold flex items-center justify-center hover:bg-[#9a4318] active:bg-[#7a3510] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-[2px_2px_0_#9a4318]"
        aria-label={t('aria.rowIncrease')}
      >
        +
      </button>
    </div>
  );
}
