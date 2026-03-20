import { memo, useCallback, useRef, useState } from 'react';
import type { KnittingMark } from '@/lib/types';

const MARKER_COLORS = [
  'bg-violet-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-pink-500',
  'bg-orange-500',
];

const BORDER_COLORS = [
  'border-violet-400',
  'border-sky-400',
  'border-amber-400',
  'border-emerald-400',
  'border-pink-400',
  'border-orange-400',
];

const TEXT_COLORS = [
  'text-violet-600',
  'text-sky-600',
  'text-amber-600',
  'text-emerald-600',
  'text-pink-600',
  'text-orange-600',
];

interface KnittingMarkersProps {
  marks: KnittingMark[];
  isPlacing: boolean;
  onPlace: (y: number) => void;
  onMove: (id: string, y: number) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onCancelPlace: () => void;
}

const KnittingMarkers = memo(function KnittingMarkers({
  marks,
  isPlacing,
  onPlace,
  onMove,
  onDelete,
  onDeleteAll,
  onCancelPlace,
}: KnittingMarkersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ clientY: number; markY: number } | null>(null);

  const toYPercent = useCallback((clientY: number) => {
    if (!containerRef.current) return 50;
    const rect = containerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
  }, []);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPlacing) {
        onPlace(toYPercent(e.clientY));
        return;
      }
      setSelectedId(null);
    },
    [isPlacing, onPlace, toYPercent]
  );

  const handleMarkerPointerDown = useCallback(
    (mark: KnittingMark) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (isPlacing) return;
      setSelectedId(mark.id);
      setDraggingId(mark.id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = { clientY: e.clientY, markY: mark.y };
    },
    [isPlacing]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId || !dragStartRef.current || !containerRef.current) return;
      e.stopPropagation();
      const rect = containerRef.current.getBoundingClientRect();
      const dy = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100;
      const newY = Math.max(0, Math.min(100, dragStartRef.current.markY + dy));
      onMove(draggingId, newY);
    },
    [draggingId, onMove]
  );

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    dragStartRef.current = null;
  }, []);

  const getColorIndex = (mark: KnittingMark) => {
    if (mark.color !== undefined) return parseInt(mark.color) % MARKER_COLORS.length;
    const idx = marks.indexOf(mark);
    return idx % MARKER_COLORS.length;
  };

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
      {/* Placing mode indicator */}
      {isPlacing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-2 bg-violet-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
            <span className="animate-pulse w-2 h-2 bg-white rounded-full" />
            탭하여 마커 배치
            <button
              onClick={(e) => { e.stopPropagation(); onCancelPlace(); }}
              className="ml-1 text-white/70 hover:text-white"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* Markers */}
      {marks.map((mark) => {
        const isSelected = selectedId === mark.id;
        const isDraggingThis = draggingId === mark.id;
        const ci = getColorIndex(mark);

        return (
          <div
            key={mark.id}
            className="absolute left-0 right-0 pointer-events-auto"
            style={{
              top: `${mark.y}%`,
              transform: 'translateY(-50%)',
              zIndex: isSelected || isDraggingThis ? 25 : 18,
            }}
          >
            {/* Horizontal line */}
            <div
              className={`w-full h-px opacity-70 ${
                ci === 0 ? 'bg-violet-400' :
                ci === 1 ? 'bg-sky-400' :
                ci === 2 ? 'bg-amber-400' :
                ci === 3 ? 'bg-emerald-400' :
                ci === 4 ? 'bg-pink-400' :
                'bg-orange-400'
              } ${isSelected ? 'opacity-100 h-0.5' : ''}`}
            />

            {/* Label tab on the right */}
            <div
              className={`absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1 touch-none select-none`}
              onPointerDown={handleMarkerPointerDown(mark)}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow-md cursor-grab active:cursor-grabbing transition-transform ${isDraggingThis ? 'scale-110' : ''} ${
                  ci === 0 ? 'bg-violet-500' :
                  ci === 1 ? 'bg-sky-500' :
                  ci === 2 ? 'bg-amber-500' :
                  ci === 3 ? 'bg-emerald-500' :
                  ci === 4 ? 'bg-pink-500' :
                  'bg-orange-500'
                } ${isSelected ? 'ring-2 ring-white/60 ring-offset-1' : ''}`}
              >
                <svg className="w-2.5 h-2.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                {mark.label}
              </div>

              {isSelected && !isDraggingThis && (
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
              )}
            </div>
          </div>
        );
      })}

      {/* Delete all */}
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

export default KnittingMarkers;
