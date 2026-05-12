import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RulerDirection, RulerOrientation } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface RowRulerProps {
  positionY: number;
  height: number;
  direction: RulerDirection;
  orientation?: RulerOrientation;
  positionX?: number;
  rotation?: number;
  isAdjusting?: boolean;
  isPlacingMarker?: boolean;
  showSettings?: boolean;
  onChangePosition: (y: number) => void;
  onChangePositionX?: (x: number) => void;
  onChangeHeight: (h: number) => void;
  onToggleSettings: () => void;
  onDragStart?: () => void;
}

const RowRuler = memo(function RowRuler({
  positionY,
  height,
  direction,
  orientation = 'vertical',
  positionX = 50,
  rotation = 0,
  isAdjusting = false,
  isPlacingMarker = false,
  showSettings = false,
  onChangePosition,
  onChangePositionX,
  onChangeHeight,
  onToggleSettings,
  onDragStart,
}: RowRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showActionBar, setShowActionBar] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const triggerPreview = useCallback(() => {
    setShowPreview(true);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setShowPreview(false), 2000);
  }, []);
  const isHorizontal = orientation === 'horizontal';

  // Shadow overlay path: full-container rect minus rotated ruler band (evenodd cutout)
  const shadowPath = useMemo(() => {
    const { w, h } = containerSize;
    if (w === 0 || h === 0) return null;
    // Extend the band to the container diagonal so the shadow cutout spans the
    // full container after rotation, matching the extended visual border lines.
    const diagonal = Math.ceil(Math.sqrt(w * w + h * h));
    let cxPx: number, cyPx: number, hwPx: number, hhPx: number;
    if (isHorizontal) {
      cxPx = w * (positionX + height / 2) / 100;
      cyPx = h / 2;
      hwPx = w * height / 200;
      hhPx = diagonal;
    } else {
      cxPx = w / 2;
      cyPx = h * (positionY + height / 2) / 100;
      hwPx = diagonal;
      hhPx = h * height / 200;
    }
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const pt = (dx: number, dy: number) => ({
      x: (cxPx + dx * cos - dy * sin) / w * 100,
      y: (cyPx + dx * sin + dy * cos) / h * 100,
    });
    const tl = pt(-hwPx, -hhPx), tr = pt(hwPx, -hhPx);
    const br = pt(hwPx, hhPx), bl = pt(-hwPx, hhPx);
    return `M 0 0 L 100 0 L 100 100 L 0 100 Z M ${tl.x} ${tl.y} L ${tr.x} ${tr.y} L ${br.x} ${br.y} L ${bl.x} ${bl.y} Z`;
  }, [containerSize, isHorizontal, positionX, positionY, height, rotation]);

  const dragStartRef = useRef<{
    clientY: number; startY: number;
    clientX: number; startX: number;
  } | null>(null);
  const hasDraggedRef = useRef(false);
  const pointerDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const { t } = useLanguage();

  const toPercentY = useCallback((clientY: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    // Use Math.round to match clientHeight (integer) used in PatternView's
    // handleRulerPositionChange, preventing sub-pixel drift on non-integer DPR devices.
    return ((clientY - rect.top) / Math.round(rect.height)) * 100;
  }, []);

  const toPercentX = useCallback((clientX: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return ((clientX - rect.left) / Math.round(rect.width)) * 100;
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
        {/* Shadow overlay with rotated cutout */}
        {shadowPath ? (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={shadowPath} fill="rgba(0,0,0,0.25)" fillRule="evenodd" />
          </svg>
        ) : (
          <>
            <div className="absolute top-0 bottom-0 left-0 pointer-events-none bg-black/25" style={{ width: `${positionX}%` }} />
            <div className="absolute top-0 bottom-0 right-0 pointer-events-none bg-black/25" style={{ left: `${positionX + height}%` }} />
          </>
        )}

        {/* Ghost preview lines */}
        {(isAdjusting || isDragging || showSettings || showPreview) && previewLines.map((x, i) => {
          const opacity = Math.max(0.1, 0.85 - i * 0.08);
          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${x}%`, width: `${height}%`, opacity, transition: 'none', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}
            >
              <div className="absolute inset-0" style={{ background: 'rgba(181,84,30,0.12)' }} />
              <div className="absolute left-0 w-px" style={{ top: '-200%', bottom: '-200%', background: 'rgba(181,84,30,0.55)' }} />
              <div className="absolute right-0 w-px" style={{ top: '-200%', bottom: '-200%', background: 'rgba(181,84,30,0.55)' }} />
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
          style={{ left: `${positionX}%`, width: `${height}%`, pointerEvents: isPlacingMarker ? 'none' : 'auto', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}
        >
          <div
            className="w-full h-full cursor-grab active:cursor-grabbing select-none relative"
            onPointerDown={handleBodyPointerDown}
          >
            <div className="absolute left-0 w-px" style={{ top: '-200%', bottom: '-200%', background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
            <div className="absolute right-0 w-px" style={{ top: '-200%', bottom: '-200%', background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
            </div>
        </div>

        {/* Action bar popup — tap ruler to show/hide */}
        {showActionBar && !isDragging && (
          <div
            className="absolute top-1/2 pointer-events-auto z-20"
            style={{ left: `${positionX}%`, transform: 'translate(calc(-100% - 8px), -50%)' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div className="flex items-stretch bg-[#fdf6e8] rounded-xl shadow-lg border border-[#d4b896] overflow-hidden whitespace-nowrap">
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
              <div className="w-px bg-[#d4b896]" />
              <button
                onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePositionX?.(Math.max(0, positionX - 0.1)); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center justify-center px-3.5 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
                title="진행선 왼쪽으로"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="none">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10 L8 5 L8 15 Z" fill="currentColor" />
                  <line x1="14" y1="3" x2="14" y2="17" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
              <div className="w-px bg-[#d4b896]" />
              <button
                onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePositionX?.(Math.min(100 - height, positionX + 0.1)); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center justify-center px-3.5 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
                title="진행선 오른쪽으로"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="none">
                  <line x1="6" y1="3" x2="6" y2="17" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 10 L12 5 L12 15 Z" fill="currentColor" />
                </svg>
              </button>
              <div className="w-px bg-[#d4b896]" />
              <button
                onClick={(e) => { e.stopPropagation(); if (showSettings) onToggleSettings(); setShowActionBar(false); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex items-center justify-center px-2.5 py-2.5 text-[#b07840]/60 hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
                title="닫기"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
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
      {/* Shadow overlay with rotated cutout */}
      {shadowPath ? (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={shadowPath} fill="rgba(0,0,0,0.25)" fillRule="evenodd" />
        </svg>
      ) : (
        <>
          <div className="absolute left-0 right-0 top-0 pointer-events-none bg-black/25" style={{ height: `${positionY}%` }} />
          <div className="absolute left-0 right-0 bottom-0 pointer-events-none bg-black/25" style={{ top: `${positionY + height}%` }} />
        </>
      )}

      {/* Ghost preview lines */}
      {(isAdjusting || isDragging || showSettings || showPreview) && previewLines.map((y, i) => {
        const opacity = Math.max(0.1, 0.85 - i * 0.08);
        return (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: `${y}%`, height: `${height}%`, opacity, transition: 'none', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}
          >
            <div className="absolute inset-0" style={{ background: 'rgba(181,84,30,0.12)' }} />
            <div className="absolute top-0 h-px" style={{ left: '-200%', right: '-200%', background: 'rgba(181,84,30,0.55)' }} />
            <div className="absolute bottom-0 h-px" style={{ left: '-200%', right: '-200%', background: 'rgba(181,84,30,0.55)' }} />
            <div className="absolute right-16 top-1/2 -translate-y-1/2 text-[10px] font-semibold select-none" style={{ color: 'rgba(181,84,30,0.75)' }}>
              +{i + 1}
            </div>
          </div>
        );
      })}

      {/* Active ruler band */}
      <div
        className="absolute left-0 right-0"
        style={{ top: `${positionY}%`, height: `${height}%`, pointerEvents: isPlacingMarker ? 'none' : 'auto', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center center' }}
      >
        <div
          className="w-full h-full cursor-grab active:cursor-grabbing select-none relative"
          onPointerDown={handleBodyPointerDown}
        >
          <div className="absolute top-0 h-px" style={{ left: '-200%', right: '-200%', background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
          <div className="absolute bottom-0 h-px" style={{ left: '-200%', right: '-200%', background: isDragging ? 'rgba(181,84,30,0.8)' : 'rgba(181,84,30,0.6)' }} />
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
          <div className="flex items-stretch bg-[#fdf6e8] rounded-xl shadow-lg border border-[#d4b896] overflow-hidden whitespace-nowrap">
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
            <div className="w-px bg-[#d4b896]" />
            <button
              onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePosition(Math.max(0, positionY - 0.1)); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center px-3.5 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
              title="진행선 위로"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 3 L5 8 L15 8 Z" fill="currentColor" />
                <line x1="3" y1="14" x2="17" y2="14" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
            <div className="w-px bg-[#d4b896]" />
            <button
              onClick={(e) => { e.stopPropagation(); triggerPreview(); onChangePosition(Math.min(100 - height, positionY + 0.1)); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center px-3.5 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
              title="진행선 아래로"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 20 20" fill="none">
                <line x1="3" y1="6" x2="17" y2="6" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 17 L5 12 L15 12 Z" fill="currentColor" />
              </svg>
            </button>
            <div className="w-px bg-[#d4b896]" />
            <button
              onClick={(e) => { e.stopPropagation(); if (showSettings) onToggleSettings(); setShowActionBar(false); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center px-2.5 py-2.5 text-[#b07840]/60 hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
              title="닫기"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Arrow pointing down toward ruler */}
          <div className="absolute bottom-0 left-1/2 translate-y-full -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#d4b896]" />
        </div>
      )}
    </div>
  );
});

export default RowRuler;
