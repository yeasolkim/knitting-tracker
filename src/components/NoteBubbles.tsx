'use client';

import { memo, useCallback, useRef, useState } from 'react';
import type { NotePosition } from '@/lib/types';

interface NoteBubblesProps {
  notes: Record<string, string>;
  positions: Record<string, NotePosition>;
  onPositionChange: (key: string, pos: NotePosition) => void;
}

function parseLabel(key: string): string {
  const i = key.indexOf(':');
  return i === -1 ? key : key.slice(i + 1);
}

const NoteBubbles = memo(function NoteBubbles({ notes, positions, onPositionChange }: NoteBubblesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const toPercentX = useCallback((clientX: number) => {
    if (!containerRef.current) return 50;
    const rect = containerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlePointerDown = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      const pointerId = e.pointerId;
      const target = e.currentTarget as HTMLElement;

      longPressTimer.current = setTimeout(() => {
        setDraggingKey(key);
        setExpandedKey(null);
        target.setPointerCapture(pointerId);
      }, 400);
    },
    []
  );

  const handlePointerMove = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      if (draggingKey !== key) return;
      e.stopPropagation();
      const pos = positions[key];
      if (pos) {
        onPositionChange(key, { ...pos, x: toPercentX(e.clientX) });
      }
    },
    [draggingKey, positions, onPositionChange, toPercentX]
  );

  const handlePointerUp = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (draggingKey === key) {
        setDraggingKey(null);
      } else {
        setExpandedKey((prev) => (prev === key ? null : key));
      }
    },
    [draggingKey]
  );

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setDraggingKey(null);
  }, []);

  const keys = Object.keys(notes).filter((key) => positions[key]);

  if (keys.length === 0) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {keys.map((key) => {
        const pos = positions[key];
        const text = notes[key];
        const label = parseLabel(key);
        const isExpanded = expandedKey === key;
        const isDragging = draggingKey === key;

        return (
          <div
            key={key}
            className="absolute pointer-events-auto"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isExpanded || isDragging ? 30 : 20,
            }}
          >
            <div
              className={`touch-none select-none transition-transform ${isDragging ? 'scale-125 cursor-grabbing' : 'cursor-pointer'}`}
              onPointerDown={handlePointerDown(key)}
              onPointerMove={handlePointerMove(key)}
              onPointerUp={handlePointerUp(key)}
              onPointerCancel={handlePointerCancel}
            >
              <div className={`relative flex items-center justify-center w-7 h-7 rounded-full shadow-md transition-colors ${isDragging ? 'bg-amber-400' : 'bg-amber-500'}`}>
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17z"/>
                  <path d="M4 4v12h14.83L20 17.17V4H4z" opacity=".3"/>
                </svg>
                <span className="absolute -top-1 -right-1 text-[9px] font-bold bg-white text-amber-600 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                  {label}
                </span>
              </div>
            </div>

            {isExpanded && !isDragging && (
              <div
                className="absolute top-8 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[120px] max-w-[200px] z-40"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] text-amber-500 font-medium mb-0.5">{label}단</div>
                <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{text}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default NoteBubbles;
