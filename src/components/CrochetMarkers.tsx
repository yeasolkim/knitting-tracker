'use client';

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
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
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
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        markX: mark.x,
        markY: mark.y,
      };
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
      const newX = Math.max(0, Math.min(100, dragStartRef.current.markX + dx));
      const newY = Math.max(0, Math.min(100, dragStartRef.current.markY + dy));
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
      {/* Placing mode indicator */}
      {isPlacing && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-2 bg-rose-500 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
            <span className="animate-pulse w-2 h-2 bg-white rounded-full" />
            도안을 탭하여 마커 배치
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancelPlace();
              }}
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
        const isDragging = draggingId === mark.id;

        return (
          <div
            key={mark.id}
            className="absolute pointer-events-auto"
            style={{
              left: `${mark.x}%`,
              top: `${mark.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected || isDragging ? 25 : 20,
            }}
          >
            {/* Marker dot */}
            <div
              className={`touch-none select-none transition-transform ${isDragging ? 'scale-125' : ''}`}
              onPointerDown={handleMarkerPointerDown(mark)}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`relative flex items-center justify-center w-8 h-8 rounded-full shadow-md transition-all cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? 'bg-rose-500 ring-2 ring-rose-300 ring-offset-1'
                    : 'bg-rose-500/80 hover:bg-rose-500'
                }`}
              >
                <span className="text-[11px] font-bold text-white">{mark.label}</span>
              </div>
            </div>

            {/* Delete button on selection */}
            {isSelected && !isDragging && (
              <div className="absolute -top-2 -right-2 z-30">
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

      {/* Delete all - fixed position, shown when selected */}
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
