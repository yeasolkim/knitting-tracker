import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  cx: number;               // center X as % of containerW (screen space)
  cy: number;               // center Y as % of containerH (screen space)
  r: number;                // radius as % of containerW (screen space)
  completedRings: number[]; // each completed ring radius as % of containerW
  containerW: number;
  containerH: number;
  onCenterChange: (cx: number, cy: number) => void;
  onRadiusChange: (r: number) => void;
  onComplete: () => void;
  onDragStart: () => void;
}

export default function CrochetRuler({
  cx, cy, r, completedRings,
  containerW, containerH,
  onCenterChange, onRadiusChange, onComplete, onDragStart,
}: Props) {
  const { t } = useLanguage();

  const cxPx = (cx / 100) * containerW;
  const cyPx = (cy / 100) * containerH;
  const rPx = Math.max(4, (r / 100) * containerW);

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
  };
  const onRadiusMove = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!radiusDragRef.current) return;
    const dx = (e.clientX - radiusDragRef.current.sx) / containerW * 100;
    onRadiusChange(Math.max(1, radiusDragRef.current.r + dx));
  };
  const onRadiusUp = () => { radiusDragRef.current = null; };

  // Full-circle path via two 180° arcs (compatible with fill-rule: evenodd)
  const arcPath = (radius: number) =>
    `M ${cxPx - radius} ${cyPx} ` +
    `a ${radius} ${radius} 0 1 0 ${radius * 2} 0 ` +
    `a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;

  // 단 완료 button: below the circle
  const btnTopPct = ((cyPx + rPx + 12) / containerH) * 100;

  return (
    <>
      <svg
        className="absolute inset-0"
        style={{ width: containerW, height: containerH, pointerEvents: 'none', overflow: 'visible' }}
      >
        {/* Completed rings — shaded annular regions + dashed borders */}
        {completedRings.map((ringR, i) => {
          const outerPx = Math.max(4, (ringR / 100) * containerW);
          const innerPx = i > 0 ? Math.max(4, (completedRings[i - 1] / 100) * containerW) : 0;
          const d = innerPx > 2
            ? arcPath(outerPx) + ' ' + arcPath(innerPx)
            : arcPath(outerPx);
          return (
            <g key={i}>
              <path d={d} fill="rgba(181,84,30,0.13)" fillRule="evenodd" />
              <circle cx={cxPx} cy={cyPx} r={outerPx}
                fill="none" stroke="rgba(181,84,30,0.4)"
                strokeWidth={1.5} strokeDasharray="5 3" />
            </g>
          );
        })}

        {/* Current ring — shaded annular from last completed to current */}
        {(() => {
          const innerPx = completedRings.length > 0
            ? Math.max(4, (completedRings[completedRings.length - 1] / 100) * containerW)
            : 0;
          const d = innerPx > 2
            ? arcPath(rPx) + ' ' + arcPath(innerPx)
            : arcPath(rPx);
          return <path d={d} fill="rgba(181,84,30,0.08)" fillRule="evenodd" />;
        })()}

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

      {/* 단 완료 button — positioned below the circle */}
      <button
        onClick={onComplete}
        style={{
          position: 'absolute',
          left: `${cx}%`,
          top: `${btnTopPct}%`,
          transform: 'translateX(-50%)',
          pointerEvents: 'all',
          touchAction: 'manipulation',
        }}
        className="bg-[#b5541e] text-[#fdf6e8] px-4 py-2 rounded-lg text-xs font-bold border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318] active:shadow-none active:translate-x-[1px] active:translate-y-[1px] whitespace-nowrap select-none"
      >
        {t('ruler.complete')}
      </button>
    </>
  );
}
