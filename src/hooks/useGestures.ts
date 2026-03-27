import { useCallback, useEffect, useRef, useState } from 'react';

interface Transform {
  scale: number;
  x: number;
  y: number;
}

/**
 * Zoom around an arbitrary pivot point (px, py) relative to container center.
 *
 * Formula derivation: the content point currently at screen position
 * (W/2 + px, H/2 + py) must stay there after scale change.
 *   newX = prevX * ratio + px * (1 - ratio)
 *   newY = prevY * ratio + py * (1 - ratio)
 *
 * Screen center  → px=0, py=0  → newX/Y = prevX/Y * ratio
 * Touch midpoint → px/py = touch - containerCenter
 */
function applyZoom(prev: Transform, newScale: number, pivotX = 0, pivotY = 0): Transform {
  const ratio = newScale / prev.scale;
  return {
    scale: newScale,
    x: prev.x * ratio + pivotX * (1 - ratio),
    y: prev.y * ratio + pivotY * (1 - ratio),
  };
}

/**
 * contentSizeRef: pass a ref to { w, h } of the content (at scale=1).
 * When provided, pan/pinch are clamped to bounds DURING the gesture,
 * preventing the end-of-gesture snap that makes the progress line jump.
 */
export function useGestures(
  minScale = 0.5,
  maxScale = 5,
  contentSizeRef?: React.RefObject<{ w: number; h: number }>
) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale]
  );

  /** Clamp (x,y) to pan bounds for the given scale, using current container size. */
  const clampToBounds = useCallback((t: Transform): Transform => {
    if (!contentSizeRef?.current) return t;
    const el = containerRef.current;
    if (!el) return t;
    const H = el.clientHeight || 1;
    const W = el.clientWidth || 1;
    const { w: imgW, h: imgH } = contentSizeRef.current;
    if (imgW === 0 || imgH === 0) return t;
    const maxTy = Math.max(0, (imgH * t.scale - H) / 2);
    const maxTx = Math.max(0, (imgW * t.scale - W) / 2);
    return {
      ...t,
      x: Math.max(-maxTx, Math.min(maxTx, t.x)),
      y: Math.max(-maxTy, Math.min(maxTy, t.y)),
    };
  }, [contentSizeRef]);

  // Wheel zoom — pivot at screen center
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ratio = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform((prev) => applyZoom(prev, clampScale(prev.scale * ratio)));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampScale]);

  // Button zoom — pivot at screen center
  const zoomIn = useCallback(() => {
    setTransform((prev) => applyZoom(prev, clampScale(prev.scale * 1.1)));
  }, [clampScale]);

  const zoomOut = useCallback(() => {
    setTransform((prev) => applyZoom(prev, clampScale(prev.scale * 0.9)));
  }, [clampScale]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsPanning(true);
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

        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Pivot = touch midpoint relative to container center
        const pivotX = cx - rect.left - rect.width / 2;
        const pivotY = cy - rect.top - rect.height / 2;

        // Capture ref value before the async state updater runs.
        // handleTouchEnd can set lastTouchCenter.current to null between
        // this call and when React executes the updater, causing a crash.
        const prevCenter = lastTouchCenter.current;
        if (!prevCenter) return;

        setTransform((prev) => {
          const newScale = clampScale(prev.scale * scaleRatio);
          const zoomed = applyZoom(prev, newScale, pivotX, pivotY);
          const result = {
            ...zoomed,
            x: zoomed.x + cx - prevCenter.x,
            y: zoomed.y + cy - prevCenter.y,
          };
          return clampToBounds(result);
        });

        lastTouchDistance.current = distance;
        lastTouchCenter.current = { x: cx, y: cy };
      } else if (e.touches.length === 1 && lastTouchCenter.current) {
        const dx = e.touches[0].clientX - lastTouchCenter.current.x;
        const dy = e.touches[0].clientY - lastTouchCenter.current.y;
        setTransform((prev) => clampToBounds({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        lastTouchCenter.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    },
    [clampScale, clampToBounds]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    lastTouchCenter.current = null;
    setIsPanning(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    setIsPanning(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !lastMouse.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setTransform((prev) => clampToBounds({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [clampToBounds]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsPanning(false);
    lastMouse.current = null;
  }, []);

  // Double-click — pivot at screen center
  const handleDoubleClick = useCallback(() => {
    setTransform((prev) => {
      if (prev.scale > 1.1) return { scale: 1, x: 0, y: 0 };
      return applyZoom(prev, clampScale(prev.scale * 2));
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

  const setFullTransform = useCallback((t: Transform) => {
    setTransform({ ...t, scale: Math.min(maxScale, Math.max(minScale, t.scale)) });
  }, [minScale, maxScale]);

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
    setFullTransform,
    isPanning,
  };
}
