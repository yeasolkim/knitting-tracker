import { useRef, useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface CompletedRingData {
  cx: number;
  cy: number;
  r: number;
  ry?: number;
  shape?: string;
}

interface Props {
  cx?: number;
  cy?: number;
  r?: number;
  ry?: number;
  rowHeight?: number;
  shape?: 'circle' | 'ellipse' | 'rect';
  completedRings: CompletedRingData[];
  containerW: number;
  containerH: number;
  showSettings?: boolean;
  isAdjusting?: boolean;
  ringsOnly?: boolean;
  onCenterChange?: (cx: number, cy: number) => void;
  onRadiusChange?: (r: number) => void;
  onRyChange?: (ry: number) => void;
  onRowHeightChange?: (v: number) => void;
  onAdjustingChange?: (v: boolean) => void;
  onComplete?: () => void;
  onToggleSettings?: () => void;
  onDragStart: () => void;
  onDeleteRing: (index: number) => void;
  onDeleteAllRings: () => void;
  rotation?: number;
  onRotationChange?: (deg: number) => void;
  onShapeChange?: (shape: 'line' | 'circle' | 'ellipse' | 'rect') => void;
  onReset?: () => void;
  onUpdateRing: (i: number, updates: CompletedRingData) => void;
}

const NUDGE = 0.3;

const SHAPE_ICON: Record<string, ReactNode> = {
  line: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeLinecap="round">
      <line x1="3" y1="5" x2="21" y2="5" strokeWidth="2" />
      <line x1="3" y1="9" x2="21" y2="9" strokeWidth="2" />
      <line x1="3" y1="13" x2="21" y2="13" strokeWidth="2" />
    </svg>
  ),
  circle: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
    </svg>
  ),
  ellipse: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="8" rx="10" ry="4.5" />
    </svg>
  ),
  rect: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2.5" y="3.5" width="19" height="9" rx="1.5" />
    </svg>
  ),
};

export default function CrochetRuler({
  cx = 50, cy = 50, r = 10, ry,
  rowHeight,
  shape = 'circle',
  completedRings,
  containerW, containerH,
  showSettings = false,
  isAdjusting = false,
  ringsOnly = false,
  onCenterChange, onRadiusChange, onRyChange, onRowHeightChange, onAdjustingChange, onComplete, onToggleSettings, rotation = 0, onRotationChange, onShapeChange, onDragStart,
  onDeleteRing, onDeleteAllRings, onReset, onUpdateRing,
}: Props) {
  const { t } = useLanguage();

  const isRect = shape === 'rect';
  const isEllipse = shape === 'ellipse';
  const is2D = isEllipse || isRect;

  const cxPx = (cx / 100) * containerW;
  const cyPx = (cy / 100) * containerH;
  const rPx = Math.max(4, (r / 100) * containerW);
  const ryActual = ry ?? r;
  const ryPx = is2D ? Math.max(1, (ryActual / 100) * containerH) : rPx;

  const [maxR, setMaxR] = useState(() => Math.max(49, r));
  const [maxRy, setMaxRy] = useState(() => Math.max(49, ryActual));
  const rowHeightPx = rowHeight != null ? Math.max(1, (rowHeight / 100) * containerH) : null;
  // effectiveMaxRy: pixel-matched max row height in containerH-% units.
  // For circle (not is2D), ring ry in pixels = rPx = (r/100)*containerW, so max row height in
  // containerH-% = rPx/containerH*100 = r*containerW/containerH. For ellipse/rect, ry is already
  // in containerH-%.
  const effectiveMaxRy = is2D
    ? ryActual
    : containerH > 0 ? r * containerW / containerH : r;
  const [maxRowHeight, setMaxRowHeight] = useState(() =>
    Math.max(effectiveMaxRy * 1.5, rowHeight ?? effectiveMaxRy * 0.5, 1)
  );

  // Action bar state — tap ring body to toggle
  const [showActionBar, setShowActionBar] = useState(false);

  const centerDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [isDraggingBody, setIsDraggingBody] = useState(false);
  const bodyDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const hasDraggedBodyRef = useRef(false);
  const pointerDownBodyRef = useRef<{ x: number; y: number } | null>(null);

  // Center drag
  const onCenterDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    centerDragRef.current = { sx: e.clientX, sy: e.clientY, cx, cy };
  };
  const onCenterMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!centerDragRef.current) return;
    const dx = (e.clientX - centerDragRef.current.sx) / containerW * 100;
    const dy = (e.clientY - centerDragRef.current.sy) / containerH * 100;
    onCenterChange?.(centerDragRef.current.cx + dx, centerDragRef.current.cy + dy);
  };
  const onCenterUp = () => { centerDragRef.current = null; };

  // Corner drag (bottom-right) — resize rx and ry simultaneously
  const [isDraggingCorner, setIsDraggingCorner] = useState(false);
  const cornerDragRef = useRef<{ sx: number; sy: number; r: number; ry: number } | null>(null);
  const onCornerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingCorner(true);
    cornerDragRef.current = { sx: e.clientX, sy: e.clientY, r, ry: ryActual };
  };
  const onCornerMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!cornerDragRef.current) return;
    const dx = (e.clientX - cornerDragRef.current.sx) / containerW * 100;
    const dy = (e.clientY - cornerDragRef.current.sy) / containerH * 100;
    if (is2D) {
      onRadiusChange?.(Math.max(0.1, cornerDragRef.current.r + dx));
      onRyChange?.(Math.max(0.1, cornerDragRef.current.ry + dy));
    } else {
      onRadiusChange?.(Math.max(0.1, cornerDragRef.current.r + (dx + dy) / 2));
    }
  };
  const onCornerUp = () => { setIsDraggingCorner(false); cornerDragRef.current = null; };

  // Body drag — distinguishes tap (toggle action bar) from drag (move ring)
  const onBodyDown = (e: React.PointerEvent<SVGPathElement>) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingBody(true);
    hasDraggedBodyRef.current = false;
    pointerDownBodyRef.current = { x: e.clientX, y: e.clientY };
    bodyDragRef.current = { sx: e.clientX, sy: e.clientY, cx, cy };
    setSelectedRingIndex(null);
  };
  const onBodyMove = (e: React.PointerEvent<SVGPathElement>) => {
    if (!bodyDragRef.current) return;
    if (!hasDraggedBodyRef.current && pointerDownBodyRef.current) {
      const dx = e.clientX - pointerDownBodyRef.current.x;
      const dy = e.clientY - pointerDownBodyRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        hasDraggedBodyRef.current = true;
        setShowActionBar(false);
      }
    }
    if (hasDraggedBodyRef.current) {
      const dx = (e.clientX - bodyDragRef.current.sx) / containerW * 100;
      const dy = (e.clientY - bodyDragRef.current.sy) / containerH * 100;
      onCenterChange?.(bodyDragRef.current.cx + dx, bodyDragRef.current.cy + dy);
    }
  };
  const onBodyUp = () => {
    setIsDraggingBody(false);
    if (!hasDraggedBodyRef.current) {
      setShowActionBar(prev => !prev);
    }
    hasDraggedBodyRef.current = false;
    pointerDownBodyRef.current = null;
    bodyDragRef.current = null;
  };

  // Completed ring drag/selection
  const [selectedRingIndex, setSelectedRingIndex] = useState<number | null>(null);
  const ringDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number; i: number } | null>(null);

  const onRingDown = (e: React.PointerEvent<SVGPathElement>, i: number) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ring = completedRings[i];
    ringDragRef.current = { sx: e.clientX, sy: e.clientY, cx: ring.cx, cy: ring.cy, i };
    setSelectedRingIndex(i);
  };
  const onRingMove = (e: React.PointerEvent<SVGPathElement>, i: number) => {
    if (!ringDragRef.current || ringDragRef.current.i !== i) return;
    const dx = (e.clientX - ringDragRef.current.sx) / containerW * 100;
    const dy = (e.clientY - ringDragRef.current.sy) / containerH * 100;
    onUpdateRing(i, {
      ...completedRings[i],
      cx: ringDragRef.current.cx + dx,
      cy: ringDragRef.current.cy + dy,
    });
  };
  const onRingUp = () => { ringDragRef.current = null; };

  // Ellipse path via two 180° arcs (compatible with fill-rule: evenodd)
  const ellipsePath = (ecx: number, ecy: number, erx: number, ery: number) =>
    `M ${ecx - erx} ${ecy} ` +
    `a ${erx} ${ery} 0 1 0 ${erx * 2} 0 ` +
    `a ${erx} ${ery} 0 1 0 ${-erx * 2} 0`;

  // Rectangle path (clockwise, compatible with fill-rule: evenodd)
  const rectPath = (ecx: number, ecy: number, erw: number, erh: number) =>
    `M ${ecx - erw} ${ecy - erh} H ${ecx + erw} V ${ecy + erh} H ${ecx - erw} Z`;

  const shapePath = (ecx: number, ecy: number, erx: number, ery: number) =>
    isRect ? rectPath(ecx, ecy, erx, ery) : ellipsePath(ecx, ecy, erx, ery);

  const ringPath = (ringShape: string | undefined, ecx: number, ecy: number, erx: number, ery: number) =>
    ringShape === 'rect' ? rectPath(ecx, ecy, erx, ery) : ellipsePath(ecx, ecy, erx, ery);

  // Ghost preview rings
  const lastCompleted = completedRings.length > 0 ? completedRings[completedRings.length - 1] : null;
  const lastRPx = lastCompleted ? Math.max(4, (lastCompleted.r / 100) * containerW) : 0;
  const lastRyPx = lastCompleted
    ? (lastCompleted.ry != null ? Math.max(1, (lastCompleted.ry / 100) * containerH) : lastRPx)
    : 0;
  const stepRy = rowHeightPx ?? Math.max(ryPx - lastRyPx, ryPx * 0.3);
  const stepRx = (is2D || rowHeightPx != null) ? stepRy : Math.max(rPx - lastRPx, rPx * 0.3);
  const showGhosts = !ringsOnly && (isAdjusting || showSettings || isDraggingCorner);
  const ghostRings: { rx: number; ry: number }[] = [];
  if (showGhosts) {
    for (let i = 1; i <= 10; i++) {
      const grx = rPx + stepRx * i;
      if (grx > Math.max(containerW, containerH) * 1.2) break;
      ghostRings.push({ rx: grx, ry: ryPx + stepRy * i });
    }
  }

  // Nudge button positions
  const rHPct = (rPx / containerH) * 100;
  const nudgeTopY = cy - (is2D ? ryActual : rHPct);
  const nudgeBottomY = cy + (is2D ? ryActual : rHPct);
  const nudgeLeftX = cx - r;
  const nudgeRightX = cx + r;

  // Resize handle position
  const hx = cxPx + rPx;
  const hy = cyPx + ryPx;

  // Action bar position — above ring top edge
  const ringTopPct = cy - (is2D ? ryActual : rHPct);

  // Width icon SVG (↔)
  const WidthIcon = () => (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="6" x2="11" y2="6" />
      <polyline points="3,4 1,6 3,8" />
      <polyline points="9,4 11,6 9,8" />
    </svg>
  );

  // Height icon SVG (↕)
  const HeightIcon = () => (
    <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="1" x2="6" y2="11" />
      <polyline points="4,3 6,1 8,3" />
      <polyline points="4,9 6,11 8,9" />
    </svg>
  );

  const showOverlay = (showActionBar || showSettings) && !isDraggingBody;

  return (
    <>
      <svg
        className="absolute inset-0"
        style={{ width: containerW, height: containerH, pointerEvents: 'none', overflow: 'visible' }}
      >
        {/* Rotation group — all ring visuals + interactions rotate around ring center */}
        <g transform={rotation ? `rotate(${rotation} ${cxPx} ${cyPx})` : undefined}>
          {!ringsOnly && (
            <path
              d={`M 0 0 H ${containerW} V ${containerH} H 0 Z ${shapePath(cxPx, cyPx, rPx, ryPx)}`}
              fill="rgba(0,0,0,0.25)"
              fillRule="evenodd"
            />
          )}

          {/* Completed rings */}
          {completedRings.map((ring, i) => {
            const ringCxPx = (ring.cx / 100) * containerW;
            const ringCyPx = (ring.cy / 100) * containerH;
            const ringRxPx = Math.max(4, (ring.r / 100) * containerW);
            const ringRyPx = ring.ry != null ? Math.max(1, (ring.ry / 100) * containerH) : ringRxPx;
            const rp = ringPath(ring.shape, ringCxPx, ringCyPx, ringRxPx, ringRyPx);
            const isSelected = selectedRingIndex === i;
            return (
              <g key={i}>
                <path d={rp} fill={isSelected ? "rgba(52,211,153,0.25)" : "rgba(52,211,153,0.15)"} fillRule="evenodd" />
                <path d={rp} fill="none" stroke={isSelected ? "rgba(16,185,129,0.9)" : "rgba(16,185,129,0.5)"}
                  strokeWidth={isSelected ? 2 : 1.5} strokeDasharray="5 3" />
              </g>
            );
          })}

          {!ringsOnly && (
            <>
              {/* Current row band */}
              {rowHeightPx != null && rPx - rowHeightPx > 1 && (
                <path
                  d={`${shapePath(cxPx, cyPx, rPx, ryPx)} ${shapePath(cxPx, cyPx, Math.max(1, rPx - rowHeightPx), Math.max(1, ryPx - rowHeightPx))}`}
                  fill="rgba(181,84,30,0.18)"
                  fillRule="evenodd"
                />
              )}
              {/* Current ring fill */}
              <path d={shapePath(cxPx, cyPx, rPx, ryPx)} fill="rgba(181,84,30,0.08)" fillRule="evenodd" />

              {/* Ghost preview rings */}
              {ghostRings.map(({ rx: grx, ry: gry }, i) => {
                const opacity = Math.max(0.15, 0.85 - i * 0.08);
                const prevRx = i === 0 ? rPx : ghostRings[i - 1].rx;
                const prevRy = i === 0 ? ryPx : ghostRings[i - 1].ry;
                const gd = shapePath(cxPx, cyPx, grx, gry) + ' ' + shapePath(cxPx, cyPx, prevRx, prevRy);
                return (
                  <g key={i} style={{ opacity }}>
                    <path d={gd} fill="rgba(181,84,30,0.25)" fillRule="evenodd" />
                    <path d={shapePath(cxPx, cyPx, grx, gry)}
                      fill="none" stroke="rgba(181,84,30,0.9)"
                      strokeWidth={1.5} strokeDasharray="4 3" />
                    <text x={cxPx + grx + 4} y={cyPx + 4} fontSize={10}
                      fill="rgba(181,84,30,1)" fontWeight="700" style={{ userSelect: 'none' }}>
                      +{i + 1}
                    </text>
                  </g>
                );
              })}

              {/* Current ring border */}
              <path d={shapePath(cxPx, cyPx, rPx, ryPx)} fill="none" stroke="#b5541e" strokeWidth={1} />

              {/* Center crosshair */}
              <line x1={cxPx - 6} y1={cyPx} x2={cxPx + 6} y2={cyPx} stroke="#b5541e" strokeWidth={1.5} />
              <line x1={cxPx} y1={cyPx - 6} x2={cxPx} y2={cyPx + 6} stroke="#b5541e" strokeWidth={1.5} />

              {/* Interior drag area */}
              <path
                d={shapePath(cxPx, cyPx, rPx, ryPx)}
                fill="rgba(0,0,0,0)"
                style={{ pointerEvents: 'all', touchAction: 'none', cursor: isDraggingBody ? 'grabbing' : 'grab' }}
                onPointerDown={onBodyDown}
                onPointerMove={onBodyMove}
                onPointerUp={onBodyUp}
                onPointerCancel={onBodyUp}
              />
            </>
          )}

          {/* Completed ring interaction areas */}
          {completedRings.map((ring, i) => {
            const ringCxPx = (ring.cx / 100) * containerW;
            const ringCyPx = (ring.cy / 100) * containerH;
            const ringRxPx = Math.max(4, (ring.r / 100) * containerW);
            const ringRyPx = ring.ry != null ? Math.max(1, (ring.ry / 100) * containerH) : ringRxPx;
            const rp = ringPath(ring.shape, ringCxPx, ringCyPx, ringRxPx, ringRyPx);
            const isSelected = selectedRingIndex === i;
            return (
              <path
                key={i}
                d={rp}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                style={{
                  pointerEvents: 'stroke',
                  cursor: isSelected ? (ringDragRef.current ? 'grabbing' : 'grab') : 'pointer',
                  touchAction: 'none',
                }}
                onPointerDown={(e) => onRingDown(e, i)}
                onPointerMove={(e) => onRingMove(e, i)}
                onPointerUp={onRingUp}
                onPointerCancel={onRingUp}
              />
            );
          })}
        </g>

        {!ringsOnly && (
          <>
            {/* Center drag handle */}
            <circle cx={cxPx} cy={cyPx} r={7}
              fill="#b5541e" stroke="#fdf6e8" strokeWidth={1.5}
              style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'move' }}
              onPointerDown={onCenterDown}
              onPointerMove={onCenterMove}
              onPointerUp={onCenterUp}
              onPointerCancel={onCenterUp}
            />

            {/* Bottom-right corner resize handle */}
            <circle cx={hx} cy={hy} r={9}
              fill="#b07840" stroke="#fdf6e8" strokeWidth={1.5}
              style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'nwse-resize' }}
              onPointerDown={onCornerDown}
              onPointerMove={onCornerMove}
              onPointerUp={onCornerUp}
              onPointerCancel={onCornerUp}
            />
            <line x1={hx - 3} y1={hy - 3} x2={hx + 3} y2={hy + 3}
              stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
            <polyline points={`${hx - 1},${hy - 4} ${hx - 4},${hy - 4} ${hx - 4},${hy - 1}`}
              fill="none" stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
            <polyline points={`${hx + 1},${hy + 4} ${hx + 4},${hy + 4} ${hx + 4},${hy + 1}`}
              fill="none" stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
          </>
        )}
      </svg>

      {/* Completed ring delete buttons — only for selected ring */}
      {completedRings.map((ring, i) => {
        if (selectedRingIndex !== i) return null;
        const ringCxPx = (ring.cx / 100) * containerW;
        const ringCyPx = (ring.cy / 100) * containerH;
        const ringRyPx = ring.ry != null ? Math.max(1, (ring.ry / 100) * containerH) : Math.max(4, (ring.r / 100) * containerW);
        return (
          <div
            key={i}
            className="absolute z-50 pointer-events-auto"
            style={{ left: ringCxPx, top: ringCyPx - ringRyPx, transform: 'translate(-50%, -50%)' }}
          >
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDeleteRing(i); setSelectedRingIndex(null); }}
              className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-md active:scale-95 transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Nudge buttons — visible when action bar or settings open */}
      {!ringsOnly && showOverlay && (
        <>
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${cx}%`, top: `${nudgeTopY}%`, transform: 'translate(-50%, -100%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange?.(cx, cy - NUDGE)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${cx}%`, top: `${nudgeBottomY}%`, transform: 'translate(-50%, 0%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange?.(cx, cy + NUDGE)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${nudgeLeftX}%`, top: `${cy}%`, transform: 'translate(-100%, -50%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange?.(cx - NUDGE, cy)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${nudgeRightX}%`, top: `${cy}%`, transform: 'translate(0%, -50%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange?.(cx + NUDGE, cy)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Settings panel — fixed top-left (like knitting) */}
      {!ringsOnly && showSettings && (
        <div
          className="absolute pointer-events-auto z-30 bg-[#fdf6e8]/96 backdrop-blur-sm rounded-xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] px-2 py-2 flex flex-col items-center gap-1.5"
          style={{ top: '8px', left: '8px' }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {/* Header row: close */}
          <div className="flex items-center justify-end w-full">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onToggleSettings?.()}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0"
              title="닫기"
            >×</button>
          </div>
          <div className="border-t border-[#d4b896] w-full" />

          {/* Rotation control — only for 2D shapes */}
          {is2D && onRotationChange && (
            <>
              <div className="flex items-center gap-1.5 w-full">
                <span className="text-[9px] text-[#7a5c46] font-bold flex-shrink-0">회전</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onDragStart(); onRotationChange(Math.max(-180, rotation - 1)); }}
                  className="flex items-center justify-center w-6 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none flex-shrink-0"
                >−</button>
                <span className="text-[10px] text-[#b5541e] font-mono w-8 text-center flex-shrink-0">
                  {rotation.toFixed(0)}°
                </span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onDragStart(); onRotationChange(Math.min(180, rotation + 1)); }}
                  className="flex items-center justify-center w-6 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none flex-shrink-0"
                >+</button>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onDragStart(); onRotationChange(0); }}
                  title="초기화"
                  className="flex items-center justify-center w-6 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] hover:bg-[#ede5cc] active:scale-95 select-none flex-shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              <input
                type="range" min={-180} max={180} step={1}
                value={rotation}
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onChange={(e) => onRotationChange(Number(e.target.value))}
                className="w-full accent-[#b5541e] cursor-pointer"
              />
              <div className="border-t border-[#d4b896] w-full" />
            </>
          )}

          {/* Sliders row */}
          <div className="flex gap-2 items-end">
            {/* Rx / width column */}
            <div className="flex flex-col items-center gap-1.5">
              {is2D && <span className="text-[#a08060]"><WidthIcon /></span>}
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxR((m) => m * 1.3)}
                className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">×1.3</button>
              <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRadiusChange?.(Math.min(maxR, r + maxR / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">+</button>
              <input type="range" min={0} max={10000} step={1}
                value={Math.round(Math.min(r, maxR) / maxR * 10000)}
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onChange={(e) => { onAdjustingChange?.(true); onRadiusChange?.(Math.max(0.01, Number(e.target.value) / 10000 * maxR)); }}
                onPointerUp={() => onAdjustingChange?.(false)} onPointerCancel={() => onAdjustingChange?.(false)}
                className="accent-[#b5541e] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '28px', height: '120px' }} />
              <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRadiusChange?.(Math.max(0.01, r - maxR / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">−</button>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxR((m) => Math.max(0.01, m / 1.3))}
                className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">÷1.3</button>
              <span className="text-[10px] text-[#b5541e] font-mono text-center leading-tight">{r.toFixed(2)}%</span>
            </div>

            {/* Ry / height column — 2D shapes only */}
            {is2D && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[#a08060]"><HeightIcon /></span>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxRy((m) => m * 1.3)}
                  className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">×1.3</button>
                <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRyChange?.(Math.min(maxRy, ryActual + maxRy / 10000))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">+</button>
                <input type="range" min={0} max={10000} step={1}
                  value={Math.round(Math.min(ryActual, maxRy) / maxRy * 10000)}
                  onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                  onChange={(e) => { onAdjustingChange?.(true); onRyChange?.(Math.max(0.01, Number(e.target.value) / 10000 * maxRy)); }}
                  onPointerUp={() => onAdjustingChange?.(false)} onPointerCancel={() => onAdjustingChange?.(false)}
                  className="accent-[#b5541e] cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '28px', height: '120px' }} />
                <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRyChange?.(Math.max(0.01, ryActual - maxRy / 10000))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">−</button>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxRy((m) => Math.max(0.01, m / 1.3))}
                  className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">÷1.3</button>
                <span className="text-[10px] text-[#b5541e] font-mono text-center leading-tight">{ryActual.toFixed(2)}%</span>
              </div>
            )}

            {/* Row height column */}
            <div className="flex flex-col items-center gap-1.5 border-l border-[#d4b896] pl-2">
              <span className="text-[8px] text-[#a08060] font-bold text-center leading-tight whitespace-nowrap">행<br/>높이</span>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxRowHeight((m) => m * 1.3)}
                className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">×1.3</button>
              <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRowHeightChange?.(Math.min(maxRowHeight, (rowHeight ?? 0) + maxRowHeight / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">+</button>
              <input type="range" min={0} max={10000} step={1}
                value={rowHeight != null ? Math.round(Math.min(rowHeight, maxRowHeight) / maxRowHeight * 10000) : 0}
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onChange={(e) => { onAdjustingChange?.(true); onRowHeightChange?.(Math.max(0.01, Number(e.target.value) / 10000 * maxRowHeight)); }}
                onPointerUp={() => onAdjustingChange?.(false)} onPointerCancel={() => onAdjustingChange?.(false)}
                className="accent-[#b5541e] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '28px', height: '120px' }} />
              <button onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }} onClick={() => onRowHeightChange?.(Math.max(0.01, (rowHeight ?? maxRowHeight / 10000) - maxRowHeight / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none">−</button>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMaxRowHeight((m) => Math.max(0.01, m / 1.3))}
                className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none">÷1.3</button>
              <span className="text-[10px] text-[#b5541e] font-mono text-center leading-tight">
                {rowHeight != null ? rowHeight.toFixed(2) : '—'}%
              </span>
            </div>
          </div>

          {/* Shape selector */}
          {onShapeChange && (
            <>
              <div className="border-t border-[#d4b896] w-full" />
              <div className="flex gap-1 w-full">
                {(['line', 'circle', 'ellipse', 'rect'] as const).map((s) => (
                  <button
                    key={s}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => { onShapeChange(s); if (s === 'line') onToggleSettings?.(); }}
                    title={t(`crochet.shape.${s}`)}
                    className={`flex-1 py-1 rounded border-2 transition-colors flex items-center justify-center ${
                      shape === s
                        ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                        : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] hover:border-[#b5541e] hover:text-[#b5541e]'
                    }`}
                  >
                    {SHAPE_ICON[s]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Action bar — tap ring body to show/hide */}
      {!ringsOnly && showOverlay && (
        <div
          className="absolute pointer-events-auto z-30 flex flex-col items-center"
          style={{
            left: `${cx}%`,
            top: `${ringTopPct}%`,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {/* Action bar */}
          <div className="flex items-stretch bg-[#fdf6e8] rounded-xl shadow-lg border border-[#d4b896] overflow-hidden whitespace-nowrap">
            {/* 완료 */}
            <button
              onClick={() => { setShowActionBar(false); onComplete?.(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold bg-[#b5541e] text-[#fdf6e8] hover:bg-[#9a4318] active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t('ruler.complete')}
            </button>
            <div className="w-px bg-[#d4b896]" />
            {/* 크기 설정 */}
            <button
              onClick={() => onToggleSettings?.()}
              onPointerDown={(e) => e.stopPropagation()}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold transition-all ${
                showSettings ? 'bg-[#b5541e] text-[#fdf6e8]' : 'text-[#b07840] hover:bg-[#f5edd6] active:scale-95'
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {t('ruler.heightSettings')}
            </button>
            {completedRings.length > 0 && (
              <>
                <div className="w-px bg-[#d4b896]" />
                <button
                  onClick={() => { if (confirm(t('view.deleteAllMarks'))) onDeleteAllRings(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center justify-center px-3 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
                  title={t('view.deleteAll')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </>
            )}
            <div className="w-px bg-[#d4b896]" />
            {/* 리셋 */}
            <button
              onClick={() => { if (confirm(t('crochet.ruler.resetConfirm'))) { onReset?.(); setShowActionBar(false); } }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center px-3 py-2.5 text-[#b07840] hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
              title={t('crochet.ruler.reset')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <div className="w-px bg-[#d4b896]" />
            {/* 닫기 */}
            <button
              onClick={() => { if (showSettings) onToggleSettings?.(); setShowActionBar(false); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center px-2.5 py-2.5 text-[#b07840]/60 hover:bg-[#f5edd6] hover:text-[#b5541e] active:scale-95 transition-all"
              title="닫기"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Arrow pointing down toward ring */}
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#d4b896]" />
        </div>
      )}
    </>
  );
}
