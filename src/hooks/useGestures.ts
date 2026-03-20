import { useCallback, useEffect, useRef, useState } from 'react';

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export function useGestures(
  minScale = 0.5,
  maxScale = 5,
  rulerYPercent = 50,      // content %
  rulerHeightPercent = 0   // content %
) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Ruler values in CONTENT coords — updated via ref to avoid stale closures
  const rulerRef = useRef({ y: rulerYPercent, h: rulerHeightPercent });
  useEffect(() => {
    rulerRef.current = { y: rulerYPercent, h: rulerHeightPercent };
  });

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale]
  );

  /**
   * Compute the new ty that keeps the ruler's content center at the same
   * screen position after a scale change.
   * Ruler is stored in content %, so we convert to screen px first.
   */
  const computeNewY = (prev: Transform, newScale: number, H: number): number => {
    const contentCenterFrac = (rulerRef.current.y + rulerRef.current.h / 2) / 100;
    const contentY = contentCenterFrac * H;
    // Current screen position of that content point
    const rulerScreenY = (contentY - H / 2) * prev.scale + H / 2 + prev.y;
    const pivotOffset = rulerScreenY - H / 2;
    return prev.y + pivotOffset * (1 - newScale / prev.scale);
  };

  // Register wheel event as non-passive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ratio = e.deltaY > 0 ? 0.9 : 1.1;
      const H = el.clientHeight;
      setTransform((prev) => {
        const newScale = clampScale(prev.scale * ratio);
        const newY = computeNewY(prev, newScale, H);
        return { ...prev, scale: newScale, y: newY };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampScale]);

  const zoomIn = useCallback(() => {
    const H = containerRef.current?.clientHeight || 1;
    setTransform((prev) => {
      const newScale = clampScale(prev.scale * 1.1);
      return { ...prev, scale: newScale, y: computeNewY(prev, newScale, H) };
    });
  }, [clampScale]);

  const zoomOut = useCallback(() => {
    const H = containerRef.current?.clientHeight || 1;
    setTransform((prev) => {
      const newScale = clampScale(prev.scale * 0.9);
      return { ...prev, scale: newScale, y: computeNewY(prev, newScale, H) };
    });
  }, [clampScale]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.hypot(dx, dy);
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1) {
      lastTouchCenter.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistance.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);
        const scaleRatio = distance / lastTouchDistance.current;
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const H = containerRef.current?.clientHeight || 1;

        setTransform((prev) => {
          const newScale = clampScale(prev.scale * scaleRatio);
          const newY = computeNewY(prev, newScale, H) + cy - (lastTouchCenter.current?.y || cy);
          return {
            scale: newScale,
            x: prev.x + cx - (lastTouchCenter.current?.x || cx),
            y: newY,
          };
        });

        lastTouchDistance.current = distance;
        lastTouchCenter.current = { x: cx, y: cy };
      } else if (e.touches.length === 1 && lastTouchCenter.current) {
        const dx = e.touches[0].clientX - lastTouchCenter.current.x;
        const dy = e.touches[0].clientY - lastTouchCenter.current.y;
        setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastTouchCenter.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    },
    [clampScale]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    lastTouchCenter.current = null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !lastMouse.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    lastMouse.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    const H = containerRef.current?.clientHeight || 1;
    setTransform((prev) => {
      if (prev.scale > 1.1) return { scale: 1, x: 0, y: 0 };
      const newScale = clampScale(prev.scale * 2);
      return { ...prev, scale: newScale, y: computeNewY(prev, newScale, H) };
    });
  }, [clampScale]);

  const panBy = useCallback((dx: number, dy: number) => {
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const setXY = useCallback((x: number, y: number) => {
    setTransform((prev) => ({ ...prev, x, y }));
  }, []);

  const resetTransform = useCallback(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  return {
    transform,
    containerRef,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onDoubleClick: handleDoubleClick,
    },
    zoomIn,
    zoomOut,
    panBy,
    setXY,
    resetTransform,
  };
}
