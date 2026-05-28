import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import type { DrawPath, DrawPoint, DrawTool } from '@/lib/types';
import { screenPxToImagePct, imagePctToScreenPx } from '@/lib/coordUtils';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface Props {
  paths: DrawPath[];
  isDrawingMode: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  opacity: number; // 0-100
  viewTransform: { scale: number; x: number; y: number };
  containerW: number;
  containerH: number;
  imgW: number;
  imgH: number;
  onDrawStart: () => void;
  onPathAdd: (path: DrawPath) => void;
  onPathsChange: (paths: DrawPath[]) => void;
}

function ptsToSvgD(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} l 0.01 0.01`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

function circlePoints(cx: number, cy: number, rx: number, ry: number): DrawPoint[] {
  const n = 64;
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

function rectPoints(x1: number, y1: number, x2: number, y2: number): DrawPoint[] {
  const [minX, maxX] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [minY, maxY] = [Math.min(y1, y2), Math.max(y1, y2)];
  return [
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: maxX, y: maxY }, { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
}

export default function DrawingCanvas({
  paths, isDrawingMode, tool, color, strokeWidth, opacity,
  viewTransform, containerW, containerH, imgW, imgH,
  onDrawStart, onPathAdd, onPathsChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const cursorGroupRef = useRef<SVGGElement>(null);
  const isActiveRef = useRef(false);
  const currentImagePtsRef = useRef<DrawPoint[]>([]);
  const currentScreenDRef = useRef('');
  const shapeStartRef = useRef<DrawPoint | null>(null);

  // Keep stable ref for latest props so event handlers don't go stale
  const propsRef = useRef({ paths, tool, color, strokeWidth, opacity, viewTransform, containerW, containerH, imgW, imgH, onDrawStart, onPathAdd, onPathsChange });
  useEffect(() => { propsRef.current = { paths, tool, color, strokeWidth, opacity, viewTransform, containerW, containerH, imgW, imgH, onDrawStart, onPathAdd, onPathsChange }; });

  // Cursor is hidden until pointer enters the SVG
  useLayoutEffect(() => {
    if (cursorGroupRef.current) cursorGroupRef.current.style.display = 'none';
  }, []);

  const getPointerPos = useCallback((e: PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: e.clientX, y: e.clientY };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const moveCursor = useCallback((x: number, y: number) => {
    const el = cursorGroupRef.current;
    if (!el) return;
    el.style.transform = `translate(${x}px,${y}px)`;
    el.style.display = '';
  }, []);

  const hideCursor = useCallback(() => {
    if (cursorGroupRef.current) cursorGroupRef.current.style.display = 'none';
  }, []);

  const createLivePath = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (livePathRef.current) livePathRef.current.remove();
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const { color, strokeWidth, opacity, viewTransform } = propsRef.current;
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', String(strokeWidth * viewTransform.scale));
    el.setAttribute('stroke-opacity', String(opacity / 100));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(el);
    livePathRef.current = el;
  }, []);

  const removeLivePath = useCallback(() => {
    if (livePathRef.current) { livePathRef.current.remove(); livePathRef.current = null; }
  }, []);

  const eraseNearby = useCallback((sx: number, sy: number) => {
    const { paths, strokeWidth, viewTransform, containerW, containerH, imgW, imgH, onPathsChange } = propsRef.current;
    const radius = strokeWidth * viewTransform.scale * 2.5;
    const next = paths.filter(path => {
      return !path.points.some(pt => {
        const sp = imagePctToScreenPx(pt.x, pt.y, viewTransform, containerW, containerH, imgW, imgH);
        const dx = sp.x - sx;
        const dy = sp.y - sy;
        return dx * dx + dy * dy < radius * radius;
      });
    });
    if (next.length !== paths.length) onPathsChange(next);
  }, []);

  useEffect(() => {
    if (!isDrawingMode) {
      hideCursor();
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      const { tool, color, strokeWidth, viewTransform, containerW, containerH, imgW, imgH, onDrawStart } = propsRef.current;
      if (imgW === 0 || imgH === 0) return;

      isActiveRef.current = true;
      svg.setPointerCapture(e.pointerId);
      const pos = getPointerPos(e);
      moveCursor(pos.x, pos.y);

      onDrawStart();

      if (tool === 'eraser') {
        eraseNearby(pos.x, pos.y);
        return;
      }

      const imgPt = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);

      if (tool === 'pen') {
        currentImagePtsRef.current = [imgPt];
        currentScreenDRef.current = `M ${pos.x} ${pos.y}`;
        createLivePath();
        if (livePathRef.current) {
          livePathRef.current.setAttribute('stroke', color);
          livePathRef.current.setAttribute('stroke-width', String(strokeWidth * viewTransform.scale));
          livePathRef.current.setAttribute('d', currentScreenDRef.current);
        }
      } else {
        shapeStartRef.current = imgPt;
        createLivePath();
        if (livePathRef.current) {
          livePathRef.current.setAttribute('stroke', color);
          livePathRef.current.setAttribute('stroke-width', String(strokeWidth * viewTransform.scale));
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const pos = getPointerPos(e);
      // Always update cursor to current pointer position
      moveCursor(pos.x, pos.y);

      if (!isActiveRef.current) return;
      e.preventDefault();
      const { tool, viewTransform, containerW, containerH, imgW, imgH } = propsRef.current;

      if (tool === 'eraser') {
        eraseNearby(pos.x, pos.y);
        return;
      }

      if (tool === 'pen') {
        const last = currentImagePtsRef.current[currentImagePtsRef.current.length - 1];
        const lastScreen = imagePctToScreenPx(last.x, last.y, viewTransform, containerW, containerH, imgW, imgH);
        const dx = pos.x - lastScreen.x;
        const dy = pos.y - lastScreen.y;
        if (dx * dx + dy * dy < 9) return; // skip if < 3px movement
        const imgPt = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);
        currentImagePtsRef.current.push(imgPt);
        currentScreenDRef.current += ` L ${pos.x} ${pos.y}`;
        if (livePathRef.current) livePathRef.current.setAttribute('d', currentScreenDRef.current);
      } else if (shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);
        let pts: DrawPoint[] = [];
        if (tool === 'line') {
          pts = [start, end];
        } else if (tool === 'rect') {
          pts = rectPoints(start.x, start.y, end.x, end.y);
        } else if (tool === 'circle') {
          const rx = Math.abs(end.x - start.x) / 2;
          const ry = Math.abs(end.y - start.y) / 2;
          pts = circlePoints((start.x + end.x) / 2, (start.y + end.y) / 2, rx, ry);
        }
        if (livePathRef.current && pts.length) {
          const screenPts = pts.map(pt => imagePctToScreenPx(pt.x, pt.y, viewTransform, containerW, containerH, imgW, imgH));
          livePathRef.current.setAttribute('d', ptsToSvgD(screenPts));
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isActiveRef.current || !e.isPrimary) return;
      isActiveRef.current = false;
      svg.releasePointerCapture(e.pointerId);
      removeLivePath();

      const { tool, color, strokeWidth, opacity, viewTransform, containerW, containerH, imgW, imgH, onPathAdd } = propsRef.current;
      const pos = getPointerPos(e);

      if (tool === 'eraser') return;

      if (tool === 'pen') {
        const pts = currentImagePtsRef.current;
        if (pts.length > 0) {
          onPathAdd({ id: generateId(), points: pts, color, width: strokeWidth, opacity, tool: 'pen' });
        }
        currentImagePtsRef.current = [];
        currentScreenDRef.current = '';
      } else if (shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);
        let pts: DrawPoint[] = [];
        if (tool === 'line') {
          pts = [start, end];
        } else if (tool === 'rect') {
          pts = rectPoints(start.x, start.y, end.x, end.y);
        } else if (tool === 'circle') {
          const rx = Math.abs(end.x - start.x) / 2;
          const ry = Math.abs(end.y - start.y) / 2;
          pts = circlePoints((start.x + end.x) / 2, (start.y + end.y) / 2, rx, ry);
        }
        if (pts.length >= 2) {
          onPathAdd({ id: generateId(), points: pts, color, width: strokeWidth, opacity, tool });
        }
        shapeStartRef.current = null;
      }
    };

    // Separate cancel handler — discard in-progress stroke, do NOT commit
    const onPointerCancel = () => {
      if (!isActiveRef.current) return;
      isActiveRef.current = false;
      removeLivePath();
      currentImagePtsRef.current = [];
      currentScreenDRef.current = '';
      shapeStartRef.current = null;
    };

    const onPointerLeave = () => hideCursor();

    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerCancel);
    svg.addEventListener('pointerleave', onPointerLeave);
    return () => {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerCancel);
      svg.removeEventListener('pointerleave', onPointerLeave);
      removeLivePath();
      hideCursor();
      isActiveRef.current = false;
    };
  }, [isDrawingMode, getPointerPos, moveCursor, hideCursor, eraseNearby, createLivePath, removeLivePath]);

  // Update live path stroke-width on zoom change while actively drawing
  useEffect(() => {
    if (livePathRef.current) {
      livePathRef.current.setAttribute('stroke-width', String(strokeWidth * viewTransform.scale));
    }
  }, [viewTransform.scale, strokeWidth]);

  // Compute SVG group transform — maps image-% coords to screen px in O(1)
  const s = viewTransform.scale;
  const refW = imgW > 0 ? imgW : containerW;
  const refH = imgH > 0 ? imgH : containerH;
  const imgLeft = imgW > 0 ? (containerW - imgW) / 2 : 0;
  const imgTop  = imgH > 0 ? (containerH - imgH) / 2 : 0;
  const groupOx = (imgLeft - containerW / 2) * s + containerW / 2 + viewTransform.x;
  const groupOy = (imgTop  - containerH / 2) * s + containerH / 2 + viewTransform.y;
  const groupSx = s * refW / 100;
  const groupSy = s * refH / 100;

  // Cursor circle dimensions in screen px
  const cursorR = Math.max(4, strokeWidth * viewTransform.scale / 2);
  const eraserR = Math.max(8, strokeWidth * viewTransform.scale * 2.5);

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full z-[12]"
      style={{
        pointerEvents: isDrawingMode ? 'auto' : 'none',
        cursor: isDrawingMode ? 'none' : 'default',
        touchAction: 'none',
      }}
    >
      {/* Committed paths — single <g> transform maps image-% to screen coords */}
      <g transform={`translate(${groupOx},${groupOy}) scale(${groupSx},${groupSy})`}>
        {paths.map(path => (
          <path
            key={path.id}
            d={ptsToSvgD(path.points)}
            fill="none"
            stroke={path.color}
            strokeWidth={path.width * viewTransform.scale}
            strokeOpacity={(path.opacity ?? 100) / 100}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>

      {/* Custom cursor — position managed via direct DOM (style.transform), visuals via React */}
      <g ref={cursorGroupRef} pointerEvents="none">
        {tool === 'eraser' ? (
          <>
            <circle r={eraserR} fill="rgba(200,200,200,0.12)" stroke="white" strokeWidth={1.5} />
            <circle r={eraserR} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
          </>
        ) : (
          <>
            {/* White halo for contrast against any background */}
            <circle r={cursorR + 1.5} fill="none" stroke="white" strokeWidth={2.5} opacity={0.85} />
            {/* Colored fill — shows exact pen color and opacity */}
            <circle r={cursorR} fill={color} fillOpacity={opacity / 100} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
            {/* Center dot for precision when cursor is large */}
            {cursorR >= 8 && <circle r={1.5} fill="rgba(0,0,0,0.55)" />}
          </>
        )}
      </g>
    </svg>
  );
}
