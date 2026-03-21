import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CompletedMark } from '@/lib/types';

interface CompletedOverlayProps {
  marks: CompletedMark[];
  onUpdate: (index: number, mark: CompletedMark) => void;
  onDelete: (index: number) => void;
  onDeleteAll: () => void;
  onSelectionChange?: (hasSelection: boolean) => void;
  onDragStart?: () => void;
}

type DragMode = 'move' | 'resize-top' | 'resize-bottom' | null;

const CompletedOverlay = memo(function CompletedOverlay({ marks, onUpdate, onDelete, onDeleteAll, onSelectionChange, onDragStart }: CompletedOverlayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ clientY: number; startY: number; startH: number } | null>(null);

  const toPercent = useCallback((clientY: number) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * 100;
  }, []);

  const handlePointerDown = useCallback(
    (index: number, mode: DragMode) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDragStart?.();
      setSelectedIndex(index);
      setDragMode(mode);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragStartRef.current = {
        clientY: e.clientY,
        startY: marks[index].y,
        startH: marks[index].height,
      };
    },
    [marks, onDragStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragMode === null || selectedIndex === null || !dragStartRef.current) return;
      e.stopPropagation();

      const currentPercent = toPercent(e.clientY);
      const startPercent = toPercent(dragStartRef.current.clientY);
      const delta = currentPercent - startPercent;
      const mark = marks[selectedIndex];

      if (dragMode === 'move') {
        onUpdate(selectedIndex, {
          ...mark,
          y: dragStartRef.current.startY + delta,
        });
      } else if (dragMode === 'resize-top') {
        const newY = dragStartRef.current.startY + delta;
        const newH = dragStartRef.current.startH - delta;
        if (newH >= 0.5) {
          onUpdate(selectedIndex, { y: newY, height: newH });
        }
      } else if (dragMode === 'resize-bottom') {
        const newH = dragStartRef.current.startH + delta;
        if (newH >= 0.5) {
          onUpdate(selectedIndex, { ...mark, height: newH });
        }
      }
    },
    [dragMode, selectedIndex, marks, toPercent, onUpdate]
  );

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
    dragStartRef.current = null;
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  useEffect(() => {
    onSelectionChange?.(selectedIndex !== null);
  }, [selectedIndex, onSelectionChange]);

  if (marks.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: selectedIndex !== null ? 'auto' : 'none' }}
      onClick={handleBackgroundClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {marks.map((mark, i) => {
        const isSelected = selectedIndex === i;

        return (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-auto"
            style={{ top: `${mark.y}%`, height: `${mark.height}%` }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedIndex(isSelected ? null : i);
            }}
          >
            {/* Mark body */}
            <div
              className={`w-full h-full transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-emerald-400/30 border-y-2 border-emerald-500/70'
                  : 'bg-emerald-400/15 border-y border-emerald-500/40'
              }`}
              onPointerDown={isSelected ? handlePointerDown(i, 'move') : undefined}
              style={{ cursor: isSelected ? 'grab' : 'pointer' }}
            >
              <div className="absolute right-1 top-1/2 -translate-y-1/2 text-emerald-600/60 text-[10px] font-medium">
                ✓
              </div>
            </div>

            {isSelected && (
              <>
                {/* Top resize handle */}
                <div
                  className="absolute left-0 right-0 top-0 h-3 cursor-ns-resize z-20 flex items-center justify-center -translate-y-1/2"
                  onPointerDown={handlePointerDown(i, 'resize-top')}
                >
                  <div className="w-8 h-1 rounded-full bg-emerald-500" />
                </div>

                {/* Bottom resize handle */}
                <div
                  className="absolute left-0 right-0 bottom-0 h-3 cursor-ns-resize z-20 flex items-center justify-center translate-y-1/2"
                  onPointerDown={handlePointerDown(i, 'resize-bottom')}
                >
                  <div className="w-8 h-1 rounded-full bg-emerald-500" />
                </div>

                {/* Delete button */}
                <div className="absolute left-1 top-1/2 -translate-y-1/2 flex gap-1 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(i);
                      setSelectedIndex(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="px-2 py-0.5 text-[10px] font-medium bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm"
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

    </div>
  );
});

export default CompletedOverlay;
