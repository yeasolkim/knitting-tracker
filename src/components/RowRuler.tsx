import { memo, useCallback, useMemo, useRef, useState } from 'react';

import type { RulerDirection } from '@/lib/types';

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

      {/* Ghost preview lines — visible while dragging position or adjusting height */}
      {(isAdjusting || isDragging) && previewLines.map((y, i) => {
        const opacity = Math.max(0.1, 0.85 - i * 0.08);
        return (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: `${y}%`,
              height: `${height}%`,
              opacity,
              transition: 'none',
            }}
          >
            {/* Filled band */}
            <div className="absolute inset-0 bg-rose-300/20" />
            {/* Top & bottom edge lines — thin but visible */}
            <div className="absolute top-0 inset-x-0 h-px bg-rose-400/70" />
            <div className="absolute bottom-0 inset-x-0 h-px bg-rose-400/70" />
            {/* Row number label */}
            <div className="absolute right-16 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-rose-500/80 select-none">
              +{i + 1}
            </div>
          </div>
        );
      })}

      {/* Active ruler band — transparent window, just edge lines */}
      <div
        className="absolute left-0 right-0"
        style={{ top: `${positionY}%`, height: `${height}%`, pointerEvents: isPlacingMarker ? 'none' : 'auto' }}
      >
        <div
          className="w-full h-full cursor-grab active:cursor-grabbing select-none relative"
          onPointerDown={handleBodyPointerDown}
        >
          {/* Top edge */}
          <div className={`absolute top-0 inset-x-0 h-px transition-colors ${isDragging ? 'bg-rose-500/80' : 'bg-rose-400/70'}`} />
          {/* Bottom edge */}
          <div className={`absolute bottom-0 inset-x-0 h-px transition-colors ${isDragging ? 'bg-rose-500/80' : 'bg-rose-400/70'}`} />
        </div>
      </div>

      {/* Floating complete + direction buttons */}
      <div
        className="absolute left-1.5 pointer-events-auto z-20 flex items-center gap-1 sm:gap-1.5"
        style={{ top: `${rulerCenterY}%`, transform: 'translateY(-50%)' }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 active:bg-rose-700 active:scale-95 transition-all"
          title="완료 (다음 단으로)"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleDirection(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-white/90 border border-rose-200 text-rose-500 shadow-md hover:bg-rose-50 active:bg-rose-100 transition-all"
          title={direction === 'up' ? '진행 방향: 위로' : '진행 방향: 아래로'}
        >
          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {direction === 'up' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            )}
          </svg>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onToggleSettings(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-full border shadow-md transition-all ${
            showSettings
              ? 'bg-rose-500 border-rose-500 text-white'
              : 'bg-white/90 border-rose-200 text-rose-400 hover:bg-rose-50 active:bg-rose-100'
          }`}
          title="진행선 높이 설정"
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
