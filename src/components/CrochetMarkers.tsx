import { memo, useCallback, useRef, useState } from 'react';
import type { CrochetMark } from '@/lib/types';

interface CrochetMarkersProps {
  marks: CrochetMark[];
  isPlacing: boolean;
  onPlace: (x: number, y: number) => void;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onCancelPlace: () => void;
}

function PinIcon({ label, selected, dragging }: { label: string; selected: boolean; dragging: boolean }) {
  const fill = selected ? 'rgba(244,63,94,0.92)' : 'rgba(251,113,133,0.72)';
  const stroke = selected ? 'rgba(244,63,94,1)' : 'rgba(244,63,94,0.85)';
  return (
    <svg
      className="w-[18px] sm:w-6 h-auto"
      viewBox="0 0 24 30"
      style={{ overflow: 'visible', filter: dragging ? 'drop-shadow(0 3px 6px rgba(244,63,94,0.5))' : selected ? 'drop-shadow(0 2px 4px rgba(244,63,94,0.4))' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.25))' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 1C6.477 1 2 5.477 2 11c0 7.5 10 18 10 18s10-10.5 10-18C22 5.477 17.523 1 12 1z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.5"
      />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="700"
        fill="white"
        fillOpacity="0.95"
        style={{ userSelect: 'none' }}
      >
        {label.length > 3 ? label.slice(0, 3) : label}
      </text>
    </svg>
  );
}

const CrochetMarkers = memo(function CrochetMarkers({
  marks,
  isPlacing,
  onPlace,
  onMove,
  onDelete,
  onDeleteAll,
  onCancelPlace,
}: CrochetMarkersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; markX: number; markY: number } | null>(null);

  const toContentPercent = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 50, y: 50 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPlacing) {
        const pos = toContentPercent(e.clientX, e.clientY);
        onPlace(pos.x, pos.y);
        return;
      }
      setSelectedId(null);
    },
    [isPlacing, onPlace, toContentPercent]
  );

  const handleMarkerPointerDown = useCallback(
    (mark: CrochetMark) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (isPlacing) return;
      setSelectedId(mark.id);
      setDraggingId(mark.id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, y: e.clientY, markX: mark.x, markY: mark.y };
    },
    [isPlacing]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId || !dragStartRef.current || !containerRef.current) return;
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
      const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
      const newX = dragStartRef.current.markX + dx;
      const newY = dragStartRef.current.markY + dy;
      onMove(draggingId, newX, newY);
    },
    [draggingId, onMove]
  );

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    dragStartRef.current = null;
  }, []);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 ${isPlacing ? 'cursor-crosshair' : ''}`}
      style={{ pointerEvents: isPlacing || selectedId ? 'auto' : 'none' }}
      onClick={handleContainerClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {isPlacing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-2 bg-rose-500 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
            <span className="animate-pulse w-2 h-2 bg-white rounded-full" />
            도안을 탭하여 마커 배치
            <button
              onClick={(e) => { e.stopPropagation(); onCancelPlace(); }}
              className="ml-1 text-white/70 hover:text-white"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {marks.map((mark) => {
        const isSelected = selectedId === mark.id;
        const isDragging = draggingId === mark.id;

        return (
          <div
            key={mark.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${mark.x}%`,
              top: `${mark.y}%`,
              transform: `translate(-50%, -100%) scale(${isDragging ? 1.2 : 1})`,
              transformOrigin: '50% 100%',
              zIndex: isSelected || isDragging ? 25 : 20,
              transition: isDragging ? 'none' : 'transform 0.1s',
            }}
          >
            <div
              className="touch-none select-none cursor-grab active:cursor-grabbing"
              onPointerDown={handleMarkerPointerDown(mark)}
              onClick={(e) => e.stopPropagation()}
            >
              <PinIcon label={mark.label} selected={isSelected} dragging={isDragging} />
            </div>

            {isSelected && !isDragging && (
              <div className="absolute -top-1 -right-1 z-30">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(mark.id);
                    setSelectedId(null);
                  }}
                  className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-md hover:bg-red-600"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}

      {selectedId && marks.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('모든 마커를 삭제하시겠습니까?')) {
                onDeleteAll();
                setSelectedId(null);
              }
            }}
            className="text-[11px] text-red-400 bg-white/90 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-50 shadow-sm"
          >
            전체 삭제
          </button>
        </div>
      )}
    </div>
  );
});

export default CrochetMarkers;
