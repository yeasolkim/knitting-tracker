import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  cx: number;               // center X as % of containerW (screen space)
  cy: number;               // center Y as % of containerH (screen space)
  r: number;                // radius as % of containerW (screen space)
  completedRings: { cx: number; cy: number; r: number }[]; // each completed ring in screen % space (own center)
  containerW: number;
  containerH: number;
  showSettings?: boolean;
  isAdjusting?: boolean;
  onCenterChange: (cx: number, cy: number) => void;
  onRadiusChange: (r: number) => void;
  onComplete: () => void;
  onToggleSettings: () => void;
  onDragStart: () => void;
}

export default function CrochetRuler({
  cx, cy, r, completedRings,
  containerW, containerH,
  showSettings = false,
  isAdjusting = false,
  onCenterChange, onRadiusChange, onComplete, onToggleSettings, onDragStart,
}: Props) {
  const { t } = useLanguage();

  const cxPx = (cx / 100) * containerW;
  const cyPx = (cy / 100) * containerH;
  const rPx = Math.max(4, (r / 100) * containerW);

  const [isRadiusDragging, setIsRadiusDragging] = useState(false);

  const centerDragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const radiusDragRef = useRef<{ sx: number; r: number } | null>(null);

  // Center handle drag
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

  // Radius handle drag
  const onRadiusDown = (e: React.PointerEvent<SVGCircleElement>) => {
    e.stopPropagation();
    onDragStart();
    e.currentTarget.setPointerCapture(e.pointerId);
    radiusDragRef.current = { sx: e.clientX, r };
    setIsRadiusDragging(true);
  };
  const onRadiusMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!radiusDragRef.current) return;
    const dx = (e.clientX - radiusDragRef.current.sx) / containerW * 100;
    onRadiusChange(Math.max(1, radiusDragRef.current.r + dx));
  };
  const onRadiusUp = () => { radiusDragRef.current = null; setIsRadiusDragging(false); };

  // Full-circle path via two 180° arcs (compatible with fill-rule: evenodd)
  const arcPath = (cx: number, cy: number, radius: number) =>
    `M ${cx - radius} ${cy} ` +
    `a ${radius} ${radius} 0 1 0 ${radius * 2} 0 ` +
    `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;

  // Ghost preview rings — shown when dragging radius or settings open
  const lastCompletedPx = completedRings.length > 0
    ? Math.max(4, (completedRings[completedRings.length - 1].r / 100) * containerW)
    : 0;
  const stepPx = Math.max(rPx - lastCompletedPx, rPx * 0.3);
  const showGhosts = isRadiusDragging || isAdjusting || showSettings;
  const ghostRings: number[] = [];
  if (showGhosts) {
    for (let i = 1; i <= 10; i++) {
      const gr = rPx + stepPx * i;
      if (gr > Math.max(containerW, containerH) * 1.2) break;
      ghostRings.push(gr);
    }
  }

  return (
    <>
      <svg
        className="absolute inset-0"
        style={{ width: containerW, height: containerH, pointerEvents: 'none', overflow: 'visible' }}
      >
        {/* Shadow overlay — outside current ring */}
        <path
          d={`M 0 0 H ${containerW} V ${containerH} H 0 Z ${arcPath(cxPx, cyPx, rPx)}`}
          fill="rgba(0,0,0,0.25)"
          fillRule="evenodd"
        />

        {/* Completed rings — each fixed at its own center */}
        {completedRings.map((ring, i) => {
          const ringCxPx = (ring.cx / 100) * containerW;
          const ringCyPx = (ring.cy / 100) * containerH;
          const ringRPx = Math.max(4, (ring.r / 100) * containerW);
          return (
            <g key={i}>
              <path d={arcPath(ringCxPx, ringCyPx, ringRPx)} fill="rgba(181,84,30,0.15)" fillRule="evenodd" />
              <circle cx={ringCxPx} cy={ringCyPx} r={ringRPx}
                fill="none" stroke="rgba(181,84,30,0.45)"
                strokeWidth={1.5} strokeDasharray="5 3" />
            </g>
          );
        })}

        {/* Current ring — shaded from center to current radius */}
        <path d={arcPath(cxPx, cyPx, rPx)} fill="rgba(181,84,30,0.08)" fillRule="evenodd" />

        {/* Ghost preview rings — future ring positions */}
        {ghostRings.map((gr, i) => {
          const opacity = Math.max(0.07, 0.6 - i * 0.06);
          const prevGr = i === 0 ? rPx : ghostRings[i - 1];
          const d = arcPath(cxPx, cyPx, gr) + ' ' + arcPath(cxPx, cyPx, prevGr);
          return (
            <g key={i} style={{ opacity }}>
              <path d={d} fill="rgba(181,84,30,0.12)" fillRule="evenodd" />
              <circle cx={cxPx} cy={cyPx} r={gr}
                fill="none" stroke="rgba(181,84,30,0.55)"
                strokeWidth={1} strokeDasharray="4 3" />
              <text
                x={cxPx + gr + 4}
                y={cyPx + 4}
                fontSize={10}
                fill="rgba(181,84,30,0.75)"
                fontWeight="600"
                style={{ userSelect: 'none' }}
              >
                +{i + 1}
              </text>
            </g>
          );
        })}

        {/* Current ring border */}
        <circle cx={cxPx} cy={cyPx} r={rPx}
          fill="none" stroke="#b5541e" strokeWidth={2} />

        {/* Center crosshair */}
        <line x1={cxPx - 7} y1={cyPx} x2={cxPx + 7} y2={cyPx}
          stroke="#b5541e" strokeWidth={1.5} />
        <line x1={cxPx} y1={cyPx - 7} x2={cxPx} y2={cyPx + 7}
          stroke="#b5541e" strokeWidth={1.5} />

        {/* Center drag handle */}
        <circle
          cx={cxPx} cy={cyPx} r={11}
          fill="#b5541e" stroke="#fdf6e8" strokeWidth={2}
          style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'move' }}
          onPointerDown={onCenterDown}
          onPointerMove={onCenterMove}
          onPointerUp={onCenterUp}
          onPointerCancel={onCenterUp}
        />

        {/* Radius drag handle — at right edge of circle */}
        <circle
          cx={cxPx + rPx} cy={cyPx} r={9}
          fill="#fdf6e8" stroke="#b5541e" strokeWidth={2.5}
          style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'ew-resize' }}
          onPointerDown={onRadiusDown}
          onPointerMove={onRadiusMove}
          onPointerUp={onRadiusUp}
          onPointerCancel={onRadiusUp}
        />
      </svg>

      {/* Floating buttons — left side, same layout as RowRuler */}
      <div
        className="absolute left-1.5 pointer-events-auto z-20 flex items-center gap-1 sm:gap-1.5"
        style={{ top: `${cy}%`, transform: 'translateY(-50%)' }}
      >
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
    </>
  );
}
