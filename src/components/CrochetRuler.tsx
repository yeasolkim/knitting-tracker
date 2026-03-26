import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  cx: number;               // center X as % of containerW (screen space)
  cy: number;               // center Y as % of containerH (screen space)
  r: number;                // horizontal radius/half-width as % of containerW (screen space)
  ry?: number;              // vertical radius/half-height as % of containerH (screen space)
  shape?: 'circle' | 'ellipse' | 'rect';
  completedRings: { cx: number; cy: number; r: number; ry?: number; shape?: string }[];
  containerW: number;
  containerH: number;
  showSettings?: boolean;
  isAdjusting?: boolean;
  onCenterChange: (cx: number, cy: number) => void;
  onRadiusChange: (r: number) => void;
  onRyChange?: (ry: number) => void;
  onAdjustingChange: (v: boolean) => void;
  onComplete: () => void;
  onToggleSettings: () => void;
  onDragStart: () => void;
  onDeleteRing: (index: number) => void;
  onDeleteAllRings: () => void;
  onReset: () => void;
}

const NUDGE = 0.3;

export default function CrochetRuler({
  cx, cy, r, ry,
  shape = 'circle',
  completedRings,
  containerW, containerH,
  showSettings = false,
  isAdjusting = false,
  onCenterChange, onRadiusChange, onRyChange, onAdjustingChange, onComplete, onToggleSettings, onDragStart,
  onDeleteRing, onDeleteAllRings, onReset,
}: Props) {
  const { t } = useLanguage();

  const isRect = shape === 'rect';
  const isEllipse = shape === 'ellipse';
  const is2D = isEllipse || isRect;  // has independent ry dimension

  const cxPx = (cx / 100) * containerW;
  const cyPx = (cy / 100) * containerH;
  const rPx = Math.max(4, (r / 100) * containerW);
  const ryActual = ry ?? r;
  const ryPx = is2D ? Math.max(1, (ryActual / 100) * containerH) : rPx;

  const [maxR, setMaxR] = useState(() => Math.max(49, r));
  const [maxRy, setMaxRy] = useState(() => Math.max(49, ryActual));

  const centerDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const [isDraggingBody, setIsDraggingBody] = useState(false);
  const bodyDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

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
    onCenterChange(centerDragRef.current.cx + dx, centerDragRef.current.cy + dy);
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
      onRadiusChange(Math.max(0.5, cornerDragRef.current.r + dx));
      onRyChange?.(Math.max(0.5, cornerDragRef.current.ry + dy));
    } else {
      // circle: average of x/y delta keeps resize intuitive when dragging diagonally
      onRadiusChange(Math.max(0.5, cornerDragRef.current.r + (dx + dy) / 2));
    }
  };
  const onCornerUp = () => { setIsDraggingCorner(false); cornerDragRef.current = null; };

  // Body drag (interior of shape)
  const onBodyDown = (e: React.PointerEvent<SVGPathElement>) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingBody(true);
    bodyDragRef.current = { sx: e.clientX, sy: e.clientY, cx, cy };
  };
  const onBodyMove = (e: React.PointerEvent<SVGPathElement>) => {
    if (!bodyDragRef.current) return;
    const dx = (e.clientX - bodyDragRef.current.sx) / containerW * 100;
    const dy = (e.clientY - bodyDragRef.current.sy) / containerH * 100;
    onCenterChange(bodyDragRef.current.cx + dx, bodyDragRef.current.cy + dy);
  };
  const onBodyUp = () => { setIsDraggingBody(false); bodyDragRef.current = null; };

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
  const stepRx = Math.max(rPx - lastRPx, rPx * 0.3);
  const stepRy = Math.max(ryPx - lastRyPx, ryPx * 0.3);
  const showGhosts = isAdjusting || showSettings || isDraggingCorner;
  const ghostRings: { rx: number; ry: number }[] = [];
  if (showGhosts) {
    for (let i = 1; i <= 10; i++) {
      const grx = rPx + stepRx * i;
      if (grx > Math.max(containerW, containerH) * 1.2) break;
      ghostRings.push({ rx: grx, ry: ryPx + stepRy * i });
    }
  }

  // Nudge button positions — at ring edges
  const rHPct = (rPx / containerH) * 100;
  const nudgeTopY = cy - (is2D ? ryActual : rHPct);
  const nudgeBottomY = cy + (is2D ? ryActual : rHPct);
  const nudgeLeftX = cx - r;
  const nudgeRightX = cx + r;

  return (
    <>
      <svg
        className="absolute inset-0"
        style={{ width: containerW, height: containerH, pointerEvents: 'none', overflow: 'visible' }}
      >
        {/* Shadow overlay — outside current ring */}
        <path
          d={`M 0 0 H ${containerW} V ${containerH} H 0 Z ${shapePath(cxPx, cyPx, rPx, ryPx)}`}
          fill="rgba(0,0,0,0.25)"
          fillRule="evenodd"
        />

        {/* Completed rings — green, each fixed at its own center */}
        {completedRings.map((ring, i) => {
          const ringCxPx = (ring.cx / 100) * containerW;
          const ringCyPx = (ring.cy / 100) * containerH;
          const ringRxPx = Math.max(4, (ring.r / 100) * containerW);
          const ringRyPx = ring.ry != null ? Math.max(1, (ring.ry / 100) * containerH) : ringRxPx;
          const rp = ringPath(ring.shape, ringCxPx, ringCyPx, ringRxPx, ringRyPx);
          return (
            <g key={i}>
              <path d={rp} fill="rgba(52,211,153,0.15)" fillRule="evenodd" />
              <path d={rp} fill="none" stroke="rgba(16,185,129,0.5)"
                strokeWidth={1.5} strokeDasharray="5 3" />
              <g
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onClick={() => onDeleteRing(i)}
              >
                <circle cx={ringCxPx} cy={ringCyPx - ringRyPx} r={9} fill="rgba(239,68,68,0.8)" />
                <text
                  x={ringCxPx} y={ringCyPx - ringRyPx}
                  textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize={13} fontWeight="bold"
                  style={{ userSelect: 'none' }}
                >×</text>
              </g>
            </g>
          );
        })}

        {/* Current ring — shaded */}
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

        {/* Interior drag area — whole shape is draggable */}
        <path
          d={shapePath(cxPx, cyPx, rPx, ryPx)}
          fill="rgba(0,0,0,0)"
          style={{ pointerEvents: 'all', touchAction: 'none', cursor: isDraggingBody ? 'grabbing' : 'grab' }}
          onPointerDown={onBodyDown}
          onPointerMove={onBodyMove}
          onPointerUp={onBodyUp}
          onPointerCancel={onBodyUp}
        />

        {/* Center drag handle */}
        <circle cx={cxPx} cy={cyPx} r={7}
          fill="#b5541e" stroke="#fdf6e8" strokeWidth={1.5}
          style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'move' }}
          onPointerDown={onCenterDown}
          onPointerMove={onCenterMove}
          onPointerUp={onCenterUp}
          onPointerCancel={onCenterUp}
        />

        {/* Bottom-right corner resize handle — all shapes */}
        {(
          <>
            <circle cx={cxPx + rPx} cy={cyPx + ryPx} r={9}
              fill="#b07840" stroke="#fdf6e8" strokeWidth={1.5}
              style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'nwse-resize' }}
              onPointerDown={onCornerDown}
              onPointerMove={onCornerMove}
              onPointerUp={onCornerUp}
              onPointerCancel={onCornerUp}
            />
            {/* Resize icon lines (visual only, on top of circle) */}
            <line x1={cxPx + rPx - 4} y1={cyPx + ryPx + 4} x2={cxPx + rPx + 4} y2={cyPx + ryPx - 4}
              stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
            <line x1={cxPx + rPx + 1} y1={cyPx + ryPx + 4} x2={cxPx + rPx + 4} y2={cyPx + ryPx + 1}
              stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
            <line x1={cxPx + rPx - 4} y1={cyPx + ryPx - 1} x2={cxPx + rPx - 1} y2={cyPx + ryPx - 4}
              stroke="#fdf6e8" strokeWidth={1.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
          </>
        )}
      </svg>

      {/* Nudge buttons — visible when settings open */}
      {showSettings && (
        <>
          {/* Up */}
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${cx}%`, top: `${nudgeTopY}%`, transform: 'translate(-50%, -100%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange(cx, cy - NUDGE)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>

          {/* Down */}
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${cx}%`, top: `${nudgeBottomY}%`, transform: 'translate(-50%, 0%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange(cx, cy + NUDGE)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Left */}
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${nudgeLeftX}%`, top: `${cy}%`, transform: 'translate(-100%, -50%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange(cx - NUDGE, cy)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Right */}
          <div className="absolute pointer-events-auto z-20"
            style={{ left: `${nudgeRightX}%`, top: `${cy}%`, transform: 'translate(0%, -50%)' }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onCenterChange(cx + NUDGE, cy)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-[#fdf6e8]/50 text-[#b07840] hover:bg-[#fdf6e8]/80 hover:text-[#b5541e] active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Floating buttons — left side */}
      <div
        className="absolute left-1.5 pointer-events-auto z-20"
        style={{ top: `${cy}%`, transform: 'translateY(-50%)' }}
      >
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Complete button */}
          <button
            onClick={onComplete}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-[#b5541e] text-[#fdf6e8] shadow-lg hover:bg-[#9a4318] active:bg-[#7a3414] active:scale-95 transition-all border-2 border-[#9a4318]"
            title={t('ruler.complete')}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </button>

          {/* Delete all rings button */}
          {completedRings.length > 0 && (
            <button
              onClick={() => { if (confirm(t('view.deleteAllMarks'))) onDeleteAllRings(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-full border shadow-md transition-all bg-[#fdf6e8]/90 border-[#d4b896] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#ede5cc]"
              title={t('view.deleteAll')}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}

          {/* Reset button */}
          <button
            onClick={() => { if (confirm(t('crochet.ruler.resetConfirm'))) onReset(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-full border shadow-md transition-all bg-[#fdf6e8]/90 border-[#d4b896] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#ede5cc]"
            title={t('crochet.ruler.reset')}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Settings button */}
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

        {/* Size settings popup — positioned right of buttons */}
        {showSettings && (
          <div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-[#fdf6e8]/96 backdrop-blur-sm rounded-xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] px-2 py-2.5 flex gap-2 items-end"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Rx / width column */}
            <div className="flex flex-col items-center gap-1.5">
              {is2D && <span className="text-[9px] text-[#a08060] font-bold">↔</span>}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setMaxR((m) => m * 1.3)}
                className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none"
              >×1.3</button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onClick={() => onRadiusChange(Math.min(maxR, r + maxR / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
              >+</button>
              <input
                type="range" min={0} max={10000} step={1}
                value={Math.round(Math.min(r, maxR) / maxR * 10000)}
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onChange={(e) => {
                  onAdjustingChange(true);
                  onRadiusChange(Math.max(0.01, Number(e.target.value) / 10000 * maxR));
                }}
                onPointerUp={() => onAdjustingChange(false)}
                onPointerCancel={() => onAdjustingChange(false)}
                className="accent-[#b5541e] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '28px', height: '120px' }}
              />
              <button
                onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                onClick={() => onRadiusChange(Math.max(0.01, r - maxR / 10000))}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
              >−</button>
              <span className="text-[10px] text-[#b5541e] font-mono text-center leading-tight">
                {r.toFixed(2)}%
              </span>
            </div>

            {/* Ry / height column — 2D shapes only */}
            {is2D && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-[9px] text-[#a08060] font-bold">↕</span>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setMaxRy((m) => m * 1.3)}
                  className="flex items-center justify-center w-8 h-6 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none"
                >×1.3</button>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                  onClick={() => onRyChange?.(Math.min(maxRy, ryActual + maxRy / 10000))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
                >+</button>
                <input
                  type="range" min={0} max={10000} step={1}
                  value={Math.round(Math.min(ryActual, maxRy) / maxRy * 10000)}
                  onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                  onChange={(e) => {
                    onAdjustingChange(true);
                    onRyChange?.(Math.max(0.01, Number(e.target.value) / 10000 * maxRy));
                  }}
                  onPointerUp={() => onAdjustingChange(false)}
                  onPointerCancel={() => onAdjustingChange(false)}
                  className="accent-[#b5541e] cursor-pointer"
                  style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '28px', height: '120px' }}
                />
                <button
                  onPointerDown={(e) => { e.stopPropagation(); onDragStart(); }}
                  onClick={() => onRyChange?.(Math.max(0.01, ryActual - maxRy / 10000))}
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-lg hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
                >−</button>
                <span className="text-[10px] text-[#b5541e] font-mono text-center leading-tight">
                  {ryActual.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
