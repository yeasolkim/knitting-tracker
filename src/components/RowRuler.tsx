import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { RulerDirection } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface RowRulerProps {
  positionY: number;
  height: number;
  direction: RulerDirection;
  isAdjusting?: boolean;
  isPlacingMarker?: boolean;
  showSettings?: boolean;
  onChangePosition: (y: number) => void;
  onChangeHeight: (h: number) => void;
  onComplete: () => void;
  onToggleDirection: () => void;
  onToggleSettings: () => void;
  onDragStart?: () => void;
}

const RowRuler = memo(function RowRuler({
  positionY,
  height,
  direction,
  isAdjusting = false,
  isPlacingMarker = false,
  showSettings = false,
  onChangePosition,
  onChangeHeight,
  onComplete,
  onToggleDirection,
  onToggleSettings,
  onDragStart,
}: RowRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ clientY: number; startY: number } | null>(null);
  const { t } = useLanguage();

  const toPercent = useCallback((clientY: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * 100;
  }, []);

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDragStart?.();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { clientY: e.clientY, startY: positionY };
    },
    [positionY, onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      e.stopPropagation();
      const currentPercent = toPercent(e.clientY);
      const startPercent = toPercent(dragStartRef.current.clientY);
      const delta = currentPercent - startPercent;
      const newY = Math.max(0, Math.min(100 - height, dragStartRef.current.startY + delta));
      onChangePosition(newY);
    },
    [isDragging, height, toPercent, onChangePosition]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  const previewLines = useMemo(() => {
    const lines: number[] = [];
    const count = 10;
    if (direction === 'up') {
      for (let i = 1; i <= count; i++) {
        const y = positionY - height * i;
        if (y < -height) break;
        lines.push(y);
      }
    } else {
      for (let i = 1; i <= count; i++) {
        const y = positionY + height * i;
        if (y > 100) break;
        lines.push(y);
      }
    }
    return lines;
  }, [direction, positionY, height]);

  const rulerCenterY = positionY + height / 2;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Shadow overlay — ABOVE ruler */}
      <div
        className="absolute left-0 right-0 top-0 pointer-events-none bg-black/25"
        style={{ height: `${positionY}%` }}
      />

      {/* Shadow overlay — BELOW ruler */}
      <div
        className="absolute left-0 right-0 bottom-0 pointer-events-none bg-black/25"
        style={{ top: `${positionY + height}%` }}
      />

      {/* Ghost preview lines */}
      {(isAdjusting || isDragging || showSettings) && previewLines.map((y, i) => {
        const opacity = Math.max(0.1, 0.85 - i * 0.08);
        return (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${y}%`, height: `${height}%`, opacity, transition: 'none' }}
          >
            <div className="absolute inset-0" style={{ background: 'rgba(181,84,30,0.12)' }} />
            <div className="absolute top-0 inset-x-0 h-px" style={{ background: 'rgba(181,84,30,0.55)' }} />
            <div className="absolute bottom-0 inset-x-0 h-px" style={{ background: 'rgba(181,84,30,0.55)' }} />
            <div className="absolute right-16 top-1/2 -translate-y-1/2 text-[10px] font-semibold select-none" style={{ color: 'rgba(181,84,30,0.75)' }}>
              +{i + 1}
            </div>
          </div>
        );
      })}

      {/* Active ruler band */}
      <div
        className="absolute left-0 right-0"
        style={{ top: `${positionY}%`, height: `${height}%`, pointerEvents: isPlacingMarker ? 'none' : 'auto' }}
      >
        <div
          className="w-full h-full cursor-grab active:cursor-grabbing select-none relative"
          onPointerDown={handleBodyPointerDown}
        >
          <div className="absolute top-0 inset-x-0 h-px" style={{ background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
          <div className="absolute bottom-0 inset-x-0 h-px" style={{ background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
        </div>
      </div>

      {/* Up nudge — horizontally centered, just above top edge */}
      <div
        className="absolute left-1/2 pointer-events-auto z-20"
        style={{ top: `${positionY}%`, transform: 'translate(-50%, -100%)' }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChangePosition(Math.max(0, positionY - 0.3)); }}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
      {/* Down nudge — horizontally centered, just below bottom edge */}
      <div
        className="absolute left-1/2 pointer-events-auto z-20"
        style={{ top: `${positionY + height}%`, transform: 'translate(-50%, 0%)' }}
      >
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChangePosition(Math.min(100 - height, positionY + 0.3)); }}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Floating complete + direction + settings buttons */}
      <div
        className="absolute left-1.5 pointer-events-auto z-20 flex items-center gap-1 sm:gap-1.5"
        style={{ top: `${rulerCenterY}%`, transform: 'translateY(-50%)' }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-[#b5541e] text-[#fdf6e8] shadow-lg hover:bg-[#9a4318] active:bg-[#7a3414] active:scale-95 transition-all border-2 border-[#9a4318]"
          title={t('ruler.complete')}
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleDirection(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex flex-col items-center justify-center gap-0.5 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#fdf6e8]/90 border border-[#d4b896] text-[#b5541e] shadow-md hover:bg-[#f5edd6] active:bg-[#ede5cc] transition-all"
          title={direction === 'up' ? t('ruler.dirUp') : t('ruler.dirDown')}
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {direction === 'up' ? (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l7-7 7 7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 17l7-7 7 7" opacity="0.45" />
              </>
            ) : (
              <>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 12l-7 7-7-7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-7 7-7-7" opacity="0.45" />
              </>
            )}
          </svg>
          <span className="text-[7px] sm:text-[8px] font-semibold leading-none tracking-tight">{t('ruler.direction')}</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleSettings(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-full border shadow-md transition-all ${
            showSettings
              ? 'bg-[#b5541e] border-[#9a4318] text-[#fdf6e8]'
              : 'bg-[#fdf6e8]/90 border-[#d4b896] text-[#b07840] hover:bg-[#f5edd6] active:bg-[#ede5cc]'
          }`}
          title={t('ruler.heightSettings')}
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
      </div>
    </div>
  );
});

export default RowRuler;
