import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { NotePosition } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface NoteBubblesProps {
  notes: Record<string, string>;
  positions: Record<string, NotePosition>;
  onPositionChange: (key: string, pos: NotePosition) => void;
  onDelete: (key: string) => void;
  scale?: number;
}

function parseLabel(key: string): string {
  const i = key.indexOf(':');
  return i === -1 ? key : key.slice(i + 1);
}

const NoteBubbles = memo(function NoteBubbles({ notes, positions, onPositionChange, onDelete, scale = 1 }: NoteBubblesProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isPendingLongPress = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  // Clear longPress timer on unmount
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Close expanded popover when tapping outside any bubble (capture phase fires before stopPropagation)
  useEffect(() => {
    if (!expandedKey) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest('[data-note-bubble]')) return;
      setExpandedKey(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedKey(null);
    };
    document.addEventListener('pointerdown', close, { capture: true });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', close, { capture: true });
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [expandedKey]);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 50, y: 50 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      // setPointerCapture must be called synchronously during a pointer event
      // (calling it from setTimeout silently fails on iOS Safari)
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      isPendingLongPress.current = true;
      setPendingKey(key);
      longPressTimer.current = setTimeout(() => {
        isPendingLongPress.current = false;
        draggingKeyRef.current = key;
        setPendingKey(null);
        setDraggingKey(key);
        setExpandedKey(null);
      }, 400);
    },
    []
  );

  const handlePointerMove = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      // Block pan propagation during long-press wait AND while dragging
      if (draggingKeyRef.current !== key && !isPendingLongPress.current) return;
      e.stopPropagation();
      e.preventDefault();
      // Use ref (not state) to check dragging — avoids race condition where
      // draggingKey state hasn't updated yet after the 400ms timer fires
      if (draggingKeyRef.current === key) {
        const { x, y } = toPercent(e.clientX, e.clientY);
        onPositionChange(key, { x, y });
      }
    },
    [onPositionChange, toPercent]
  );

  const handlePointerUp = useCallback(
    (key: string) => (e: React.PointerEvent) => {
      e.stopPropagation();
      isPendingLongPress.current = false;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (draggingKeyRef.current === key) {
        draggingKeyRef.current = null;
        setDraggingKey(null);
      } else {
        setPendingKey(null);
        setExpandedKey((prev) => (prev === key ? null : key));
      }
    },
    []
  );

  const handlePointerCancel = useCallback(() => {
    isPendingLongPress.current = false;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    draggingKeyRef.current = null;
    setPendingKey(null);
    setDraggingKey(null);
  }, []);

  // Show ALL positioned notes (even those without text yet)
  const keys = Object.keys(positions);

  if (keys.length === 0) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {keys.map((key) => {
        const pos = positions[key];
        const text = notes[key] || '';
        const label = parseLabel(key);
        const isExpanded = expandedKey === key;
        const isDragging = draggingKey === key;
        const isPending = pendingKey === key;
        const hasText = text.trim().length > 0;

        return (
          <div
            key={key}
            data-note-bubble
            className="absolute pointer-events-auto"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%, -50%) scale(${(isDragging ? 1.25 : isPending ? 1.1 : 1) / scale})`,
              zIndex: isExpanded || isDragging ? 30 : 20,
              transition: isPending || isDragging ? 'none' : undefined,
            }}
          >
            <div
              className={`touch-none select-none min-w-[44px] min-h-[44px] flex items-center justify-center ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
              onPointerDown={handlePointerDown(key)}
              onPointerMove={handlePointerMove(key)}
              onPointerUp={handlePointerUp(key)}
              onPointerCancel={handlePointerCancel}
            >
              <div className={`relative flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded-full shadow-md transition-colors ${isDragging ? 'bg-amber-400' : isPending ? 'bg-amber-400' : hasText ? 'bg-amber-500' : 'bg-amber-300'}`}>
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17z"/>
                  <path d="M4 4v12h14.83L20 17.17V4H4z" opacity=".3"/>
                </svg>
                <span className="absolute -top-1 -right-1 text-[8px] sm:text-[9px] font-bold bg-white text-amber-600 rounded-full w-3 h-3 sm:w-4 sm:h-4 flex items-center justify-center shadow-sm">
                  {label}
                </span>
              </div>
            </div>

            {isExpanded && !isDragging && (
              <div
                className="absolute top-8 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 min-w-[120px] max-w-[200px] z-40"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[10px] text-amber-500 font-medium">
                    {t('notes.rowLabel').replace('{n}', label)}
                  </div>
                  <button
                    onClick={() => { setExpandedKey(null); onDelete(key); }}
                    className="text-gray-300 hover:text-red-400 transition-colors p-0.5"
                    aria-label={t('notes.clearCurrent')}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {hasText ? (
                  <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{text}</p>
                ) : (
                  <p className="text-xs text-gray-400 italic">{t('notes.bubble.empty')}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default NoteBubbles;
