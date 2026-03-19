import { memo, useCallback, useRef, useState } from 'react';

import type { RulerDirection } from '@/lib/types';

interface RowRulerProps {
  positionY: number;
  height: number;
  direction: RulerDirection;
  onChangePosition: (y: number) => void;
  onChangeHeight: (h: number) => void;
  onComplete: () => void;
  onToggleDirection: () => void;
}

type DragMode = 'move' | 'resize-top' | 'resize-bottom' | null;

const RowRuler = memo(function RowRuler({
  positionY,
  height,
  direction,
  onChangePosition,
  onChangeHeight,
  onComplete,
  onToggleDirection,
}: RowRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<{ clientY: number; startY: number; startH: number } | null>(null);

  const toPercent = useCallback(
    (clientY: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      return ((clientY - rect.top) / rect.height) * 100;
    },
    []
  );

  const handlePointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setDragMode(mode);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = {
        clientY: e.clientY,
        startY: positionY,
        startH: height,
      };
    },
    [positionY, height]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode || !dragStartRef.current || !containerRef.current) return;
      e.stopPropagation();

      const currentPercent = toPercent(e.clientY);
      const startPercent = toPercent(dragStartRef.current.clientY);
      const delta = currentPercent - startPercent;

      if (dragMode === 'move') {
        const newY = Math.max(0, Math.min(100 - height, dragStartRef.current.startY + delta));
        onChangePosition(newY);
      } else if (dragMode === 'resize-top') {
        const newY = dragStartRef.current.startY + delta;
        const newH = dragStartRef.current.startH - delta;
        if (newH >= 1 && newY >= 0) {
          onChangePosition(newY);
          onChangeHeight(newH);
        }
      } else if (dragMode === 'resize-bottom') {
        const newH = dragStartRef.current.startH + delta;
        if (newH >= 1 && positionY + newH <= 100) {
          onChangeHeight(newH);
        }
      }
    },
    [dragMode, height, positionY, toPercent, onChangePosition, onChangeHeight]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      setDragMode(null);
      dragStartRef.current = null;
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Active ruler */}
      <div
        className="absolute left-0 right-0 pointer-events-auto"
        style={{ top: `${positionY}%`, height: `${height}%` }}
      >
        {/* Top resize handle */}
        <div
          className="absolute left-0 right-0 top-0 h-6 sm:h-3 cursor-ns-resize z-20 flex items-center justify-center -translate-y-1/2"
          onPointerDown={handlePointerDown('resize-top')}
        >
          <div className={`w-12 sm:w-10 h-1.5 sm:h-1 rounded-full transition-colors ${dragMode === 'resize-top' ? 'bg-rose-500' : 'bg-rose-400/80'}`} />
        </div>

        {/* Main draggable body */}
        <div
          className={`w-full h-full cursor-grab active:cursor-grabbing bg-rose-400/15 border-y-2 border-rose-400/50 backdrop-blur-[1px] transition-colors ${dragMode === 'move' ? 'bg-rose-400/25 border-rose-500/70' : ''}`}
          onPointerDown={handlePointerDown('move')}
        >
          {/* Left: Complete + Direction as unified pill */}
          <div className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2">
            <div className="flex items-stretch rounded-lg overflow-hidden shadow-md">
              {/* Complete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[44px] text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                완료
              </button>

              {/* Direction toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDirection();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 px-2 py-2 sm:py-1.5 min-h-[44px] bg-rose-600 text-white/80 hover:text-white hover:bg-rose-700 active:bg-rose-800 transition-colors border-l border-rose-400/40"
                title={direction === 'up' ? '진행 방향: 위로' : '진행 방향: 아래로'}
              >
                <span className="text-[9px] text-white/60 hidden sm:inline">진행</span>
                <svg className="w-4 h-4 sm:w-3.5 sm:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  {direction === 'up' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Right: Drag handle */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-40">
            <div className="w-5 h-[2px] bg-rose-500 rounded" />
            <div className="w-5 h-[2px] bg-rose-500 rounded" />
            <div className="w-5 h-[2px] bg-rose-500 rounded" />
          </div>
        </div>

        {/* Bottom resize handle */}
        <div
          className="absolute left-0 right-0 bottom-0 h-6 sm:h-3 cursor-ns-resize z-20 flex items-center justify-center translate-y-1/2"
          onPointerDown={handlePointerDown('resize-bottom')}
        >
          <div className={`w-12 sm:w-10 h-1.5 sm:h-1 rounded-full transition-colors ${dragMode === 'resize-bottom' ? 'bg-rose-500' : 'bg-rose-400/80'}`} />
        </div>
      </div>
    </div>
  );
});

export default RowRuler;
