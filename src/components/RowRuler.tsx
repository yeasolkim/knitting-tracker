import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RulerDirection, RulerOrientation } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface RowRulerProps {
  positionY: number;
  height: number;
  direction: RulerDirection;
  orientation?: RulerOrientation;
  positionX?: number;
  isAdjusting?: boolean;
  isPlacingMarker?: boolean;
  showSettings?: boolean;
  onChangePosition: (y: number) => void;
  onChangePositionX?: (x: number) => void;
  onChangeHeight: (h: number) => void;
  onComplete: () => void;
  onToggleSettings: () => void;
  onDragStart?: () => void;
}

const RowRuler = memo(function RowRuler({
  positionY,
  height,
  direction,
  orientation = 'vertical',
  positionX = 50,
  isAdjusting = false,
  isPlacingMarker = false,
  showSettings = false,
  onChangePosition,
  onChangePositionX,
  onChangeHeight,
  onComplete,
  onToggleSettings,
  onDragStart,
}: RowRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
  }, []);

  const triggerPreview = useCallback(() => {
    setShowPreview(true);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setShowPreview(false), 2000);
  }, []);
  const dragStartRef = useRef<{
    clientY: number; startY: number;
    clientX: number; startX: number;
  } | null>(null);
  const hasDraggedRef = useRef(false);
  const pointerDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const { t } = useLanguage();

  const isHorizontal = orientation === 'horizontal';

  const toPercentY = useCallback((clientY: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * 100;
  }, []);

  const toPercentX = useCallback((clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }, []);

  const handleBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDragStart?.();
      setIsDragging(true);
      hasDraggedRef.current = false;
      pointerDownClientRef.current = { x: e.clientX, y: e.clientY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = {
        clientY: e.clientY, startY: positionY,
        clientX: e.clientX, startX: positionX,
      };
    },
    [positionY, positionX, onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !dragStartRef.current) return;
      e.stopPropagation();
      // Detect drag: if moved more than 5px, mark as dragged and close action bar
      if (!hasDraggedRef.current && pointerDownClientRef.current) {
        const dx = e.clientX - pointerDownClientRef.current.x;
        const dy = e.clientY - pointerDownClientRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          hasDraggedRef.current = true;
          setShowActionBar(false);
        }
      }
      if (isHorizontal) {
        const currentPct = toPercentX(e.clientX);
        const startPct = toPercentX(dragStartRef.current.clientX);
        const delta = currentPct - startPct;
        const newX = Math.max(0, Math.min(100 - height, dragStartRef.current.startX + delta));
        onChangePositionX?.(newX);
      } else {
        const currentPct = toPercentY(e.clientY);
        const startPct = toPercentY(dragStartRef.current.clientY);
        const delta = currentPct - startPct;
        const newY = Math.max(0, Math.min(100 - height, dragStartRef.current.startY + delta));
        onChangePosition(newY);
      }
    },
    [isDragging, height, isHorizontal, toPercentY, toPercentX, onChangePosition, onChangePositionX]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    if (!hasDraggedRef.current) {
      setShowActionBar(prev => !prev);
    }
    hasDraggedRef.current = false;
    pointerDownClientRef.current = null;
    dragStartRef.current = null;
  }, []);

  const previewLines = useMemo(() => {
    const lines: number[] = [];
    const count = 10;
    const pos = isHorizontal ? positionX : positionY;
    if (direction === 'up') {
      for (let i = 1; i <= count; i++) {
        const v = pos - height * i;
        if (v < -height) break;
        lines.push(v);
      }
    } else {
      for (let i = 1; i <= count; i++) {
        const v = pos + height * i;
        if (v > 100) break;
        lines.push(v);
      }
    }
    return lines;
  }, [direction, positionY, positionX, height, isHorizontal]);

  // --- Horizontal mode ---
  if (isHorizontal) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 pointer-events-none z-10"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Shadow left */}
        <div
          className="absolute top-0 bottom-0 left-0 pointer-events-none bg-black/25"
          style={{ width: `${positionX}%` }}
        />
        {/* Shadow right */}
        <div
          className="absolute top-0 bottom-0 right-0 pointer-events-none bg-black/25"
          style={{ left: `${positionX + height}%` }}
        />

        {/* Ghost preview lines */}
        {(isAdjusting || isDragging || showSettings || showPreview) && previewLines.map((x, i) => {
          const opacity = Math.max(0.1, 0.85 - i * 0.08);
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${x}%`, width: `${height}%`, opacity, transition: 'none' }}
            >
              <div className="absolute inset-0" style={{ background: 'rgba(181,84,30,0.12)' }} />
              <div className="absolute top-0 bottom-0 left-0 w-px" style={{ background: 'rgba(181,84,30,0.55)' }} />
              <div className="absolute top-0 bottom-0 right-0 w-px" style={{ background: 'rgba(181,84,30,0.55)' }} />
              <div
                className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold select-none"
                style={{ top: '40%', color: 'rgba(181,84,30,0.75)', writingMode: 'vertical-lr' }}
              >
                +{i + 1}
              </div>
            </div>
          );
        })}

        {/* Active ruler band */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: `${positionX}%`, width: `${height}%`, pointerEvents: isPlacingMarker ? 'none' : 'auto' }}
        >
          <div
            className="w-full h-full cursor-grab active:cursor-grabbing select-none relative"
            onPointerDown={handleBodyPointerDown}
          >
            <div className="absolute top-0 bottom-0 left-0 w-px" style={{ background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
            <div className="absolute top-0 bottom-0 right-0 w-px" style={{ background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
            </div>
        </div>

        {/* Left nudge — bottom to avoid overlapping the action bar popup (left side) */}
        {(showActionBar || showSettings) && !isDragging && (
          <div
            className="absolute bottom-6 pointer-events-auto z-20"
            style={{ left: `${positionX}%`, transform: 'translateX(-50%)' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePositionX?.(Math.max(0, positionX - 0.3)); }}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7 7" />
              </svg>
            </button>
          </div>
        )}
        {/* Right nudge — bottom to avoid overlapping the action bar popup (left side) */}
        {(showActionBar || showSettings) && !isDragging && (
          <div
            className="absolute bottom-6 pointer-events-auto z-20"
            style={{ left: `${positionX + height}%`, transform: 'translateX(-50%)' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePositionX?.(Math.min(100 - height, positionX + 0.3)); }}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Action bar popup — tap ruler to show/hide */}
        {showActionBar && !isDragging && (
          <div
            className="absolute top-1/2 pointer-events-auto z-20"
            style={{ left: `${positionX}%`, transform: 'translate(calc(-100% - 8px), -50%)' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div className="relative flex flex-col items-stretch bg-[#fdf6e8] rounded-xl shadow-lg border border-[#d4b896] overflow-hidden whitespace-nowrap">
              <button
                onClick={(e) => { e.stopPropagation(); setShowActionBar(false); onComplete(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold bg-[#b5541e] text-[#fdf6e8] hover:bg-[#9a4318] active:scale-95 transition-all"
                title={t('ruler.complete')}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t('ruler.complete')}
              </button>
              <div className="h-px bg-[#d4b896]" />
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSettings(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-all ${
                  showSettings
                    ? 'bg-[#b5541e] text-[#fdf6e8]'
                    : 'text-[#b07840] hover:bg-[#f5edd6] active:scale-95'
                }`}
                title={t('ruler.heightSettings')}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                {t('ruler.heightSettings')}
              </button>
            </div>
            {/* Arrow pointing right toward ruler */}
            <div className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 w-0 h-0 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-[#d4b896]" />
          </div>
        )}
      </div>
    );
  }

  // --- Vertical mode (original) ---
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
      {(isAdjusting || isDragging || showSettings || showPreview) && previewLines.map((y, i) => {
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

      {/* Action bar popup — tap ruler to show/hide */}
      {showActionBar && !isDragging && (
        <div
          className="absolute left-1/2 pointer-events-auto z-20"
          style={{ top: `${positionY}%`, transform: 'translate(-50%, calc(-100% - 8px))' }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-stretch bg-[#fdf6e8] rounded-xl shadow-lg border border-[#d4b896] overflow-hidden whitespace-nowrap">
            <button
              onClick={(e) => { e.stopPropagation(); setShowActionBar(false); onComplete(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold bg-[#b5541e] text-[#fdf6e8] hover:bg-[#9a4318] active:scale-95 transition-all"
              title={t('ruler.complete')}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t('ruler.complete')}
            </button>
            <div className="w-px bg-[#d4b896]" />
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSettings(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-all ${
                showSettings
                  ? 'bg-[#b5541e] text-[#fdf6e8]'
                  : 'text-[#b07840] hover:bg-[#f5edd6] active:scale-95'
              }`}
              title={t('ruler.heightSettings')}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {t('ruler.heightSettings')}
            </button>
          </div>
          {/* Arrow pointing down toward ruler */}
          <div className="absolute bottom-0 left-1/2 translate-y-full -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#d4b896]" />
        </div>
      )}
      {/* Up nudge — right-4, just above ruler top */}
      {showActionBar && !isDragging && (
        <div
          className="absolute right-4 pointer-events-auto z-20"
          style={{ top: `${positionY}%`, transform: 'translateY(-100%)' }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePosition(Math.max(0, positionY - 0.3)); }}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#fdf6e8] border border-[#d4b896] shadow-md text-[#b07840] hover:border-[#b5541e] hover:text-[#b5541e] active:scale-95 transition-all"
            title="진행선 위로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}
      {/* Down nudge — right-4, just below ruler bottom */}
      {showActionBar && !isDragging && (
        <div
          className="absolute right-4 pointer-events-auto z-20"
          style={{ top: `${positionY + height}%` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePosition(Math.min(100 - height, positionY + 0.3)); }}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#fdf6e8] border border-[#d4b896] shadow-md text-[#b07840] hover:border-[#b5541e] hover:text-[#b5541e] active:scale-95 transition-all"
            title="진행선 아래로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
});

export default RowRuler;
