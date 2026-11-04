import { memo } from 'react';
import type { RulerOrientation } from '@/lib/types';

interface InactiveRulerBandProps {
  /** screen % along the primary axis (top for vertical, left for horizontal) */
  position: number;
  /** screen % size along the primary axis */
  size: number;
  orientation: RulerOrientation;
  rotation?: number;
  color: string;
  name: string;
  hint: string;
  onActivate: () => void;
}

/**
 * A waiting (non-active) progress ruler: dashed, semi-transparent, not draggable.
 * Tapping it makes it the active ruler.
 */
const InactiveRulerBand = memo(function InactiveRulerBand({
  position, size, orientation, rotation = 0, color, name, hint, onActivate,
}: InactiveRulerBandProps) {
  const isHorizontal = orientation === 'horizontal';
  const style: React.CSSProperties = isHorizontal
    ? { left: `${position}%`, width: `${size}%`, top: 0, bottom: 0 }
    : { top: `${position}%`, height: `${size}%`, left: 0, right: 0 };
  return (
    <div
      className="absolute pointer-events-auto cursor-pointer select-none"
      style={{
        ...style,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
        background: `${color}14`,
        borderTop: isHorizontal ? undefined : `1.5px dashed ${color}99`,
        borderBottom: isHorizontal ? undefined : `1.5px dashed ${color}99`,
        borderLeft: isHorizontal ? `1.5px dashed ${color}99` : undefined,
        borderRight: isHorizontal ? `1.5px dashed ${color}99` : undefined,
        touchAction: 'none',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onActivate(); }}
      title={hint}
      role="button"
      aria-label={`${name} — ${hint}`}
    >
      <div
        className={`absolute px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
          isHorizontal ? 'top-1 left-1/2 -translate-x-1/2' : 'right-1 top-1/2 -translate-y-1/2'
        }`}
        style={{ background: `${color}cc`, color: '#fdf6e8' }}
      >
        {name}
      </div>
    </div>
  );
});

export default InactiveRulerBand;
