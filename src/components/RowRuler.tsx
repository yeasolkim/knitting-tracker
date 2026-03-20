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
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ clientY: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ clientY: number; startH: number } | null>(null);

  const toPercent = useCallback(
    (clientY: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      return ((clientY - rect.top) / rect.height) * 100;
    },
    []
  );

  const toPercentDelta = useCallback(
    (pixelDelta: number) => {
      if (!containerRef.current) return 0;
      const rect = containerRef.current.getBoundingClientRect();
      return (pixelDelta / rect.height) * 100;
    },
    []
  );

  // Main body drag (move ruler)
  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { clientY: e.clientY, startY: positionY };
    },
    [positionY]
  );

  // Bottom edge drag (resize height)
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeStartRef.current = { clientY: e.clientY, startH: height };
    },
    [height]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging && dragStartRef.current) {
        e.stopPropagation();
        const currentPercent = toPercent(e.clientY);
        const startPercent = toPercent(dragStartRef.current.clientY);
        const delta = currentPercent - startPercent;
        const newY = Math.max(0, Math.min(100 - height, dragStartRef.current.startY + delta));
        onChangePosition(newY);
      } else if (isResizing && resizeStartRef.current) {
        e.stopPropagation();
        const delta = toPercentDelta(e.clientY - resizeStartRef.current.clientY);
        const newH = Math.max(0.5, Math.min(40, resizeStartRef.current.startH + delta));
        if (positionY + newH <= 100) {
          onChangeHeight(newH);
        }
      }
    },
    [isDragging, isResizing, height, positionY, toPercent, toPercentDelta, onChangePosition, onChangeHeight]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      setIsDragging(false);
      setIsResizing(false);
      dragStartRef.current = null;
      resizeStartRef.current = null;
    },
    []
  );

  // Ghost preview lines showing how marks will stack
  const generatePreviewLines = () => {
    const lines: number[] = [];
    const count = 8;

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
  };

  const previewLines = generatePreviewLines();
  const rulerCenterY = positionY + height / 2;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Ghost preview lines (always visible) */}
      {previewLines.map((y, i) => (
        <div
          key={i}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${y}%`,
            height: `${height}%`,
            opacity: Math.max(0.04, 0.22 - i * 0.025),
          }}
        >
          <div className="w-full h-full bg-rose-300/30 border-y border-rose-300/40" />
        </div>
      ))}

      {/* Active ruler band */}
      <div
        className="absolute left-0 right-0 pointer-events-auto"
        style={{ top: `${positionY}%`, height: `${height}%` }}
      >
        {/* Main draggable body */}
        <div
          className={`w-full h-full cursor-grab active:cursor-grabbing select-none
            bg-rose-400/10 border-y-2
            ${isDragging ? 'border-rose-500/80 bg-rose-400/20' : 'border-rose-400/60'}
            transition-colors`}
          onPointerDown={handleBodyPointerDown}
        >
          {/* Center dashed reference line */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-px h-px border-t border-dashed border-rose-400/40 pointer-events-none" />
        </div>

        {/* Bottom resize handle */}
        <div
          className="absolute bottom-0 inset-x-0 h-4 -mb-2 cursor-ns-resize pointer-events-auto z-20 flex items-center justify-center group"
          onPointerDown={handleResizePointerDown}
        >
          <div className={`w-10 h-1 rounded-full transition-colors ${isResizing ? 'bg-rose-500' : 'bg-rose-400/50 group-hover:bg-rose-400/80'}`} />
        </div>
      </div>

      {/* Floating complete button — anchored to ruler center, left side */}
      <div
        className="absolute left-2 pointer-events-auto z-20 flex items-center gap-1.5"
        style={{ top: `${rulerCenterY}%`, transform: 'translateY(-50%)' }}
      >
        {/* Complete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 active:bg-rose-700 active:scale-95 transition-all"
          title="완료 (다음 단으로)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        {/* Direction toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleDirection();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/90 border border-rose-200 text-rose-500 shadow-md hover:bg-rose-50 active:bg-rose-100 transition-all"
          title={direction === 'up' ? '진행 방향: 위로' : '진행 방향: 아래로'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {direction === 'up' ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Height label — right side of ruler center */}
      <div
        className="absolute right-2 pointer-events-none z-20"
        style={{ top: `${rulerCenterY}%`, transform: 'translateY(-50%)' }}
      >
        <div className="text-[10px] text-rose-400/70 font-mono bg-white/70 rounded px-1 py-0.5 select-none">
          {height.toFixed(1)}%
        </div>
      </div>
    </div>
  );
});

export default RowRuler;
