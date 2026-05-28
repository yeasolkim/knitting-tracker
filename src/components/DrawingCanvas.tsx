import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import type { DrawPath, DrawPoint, DrawTool } from '@/lib/types';
import { screenPxToImagePct, imagePctToScreenPx } from '@/lib/coordUtils';
import type { ViewTransform } from '@/lib/coordUtils';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

interface BBox { minX: number; minY: number; maxX: number; maxY: number; }

type DragState =
  | { type: 'move'; pathId: string; origPoints: DrawPoint[]; startX: number; startY: number; historyDone: boolean }
  | { type: 'handle'; pathId: string; origPoints: DrawPoint[]; origBbox: BBox; hx: 0|1; hy: 0|1; historyDone: boolean };

interface Props {
  paths: DrawPath[];
  isDrawingMode: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth: number;
  opacity: number;
  viewTransform: { scale: number; x: number; y: number };
  containerW: number;
  containerH: number;
  imgW: number;
  imgH: number;
  selectedPathId: string | null;
  onSelectPath: (id: string | null) => void;
  onDeletePath: (id: string) => void;
  onDrawStart: () => void;
  onPathAdd: (path: DrawPath) => void;
  onPathsChange: (updater: DrawPath[] | ((prev: DrawPath[]) => DrawPath[])) => void;
}

function ptsToSvgD(pts: DrawPoint[]): string {
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

function computeBBox(points: DrawPoint[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function distToSegSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
}

function isPathHit(click: DrawPoint, path: DrawPath, threshSq: number, scaleY = 1): boolean {
  const pts = path.points;
  const cy = click.y * scaleY;
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegSq(click.x, cy, pts[i].x, pts[i].y * scaleY, pts[i + 1].x, pts[i + 1].y * scaleY) < threshSq) return true;
  }
  if (pts.length > 0) {
    const p = pts[pts.length - 1];
    return (click.x - p.x) ** 2 + (cy - p.y * scaleY) ** 2 < threshSq;
  }
  return false;
}

function remapPoints(points: DrawPoint[], oldBbox: BBox, newBbox: BBox): DrawPoint[] {
  const sw = oldBbox.maxX - oldBbox.minX;
  const sh = oldBbox.maxY - oldBbox.minY;
  const tw = newBbox.maxX - newBbox.minX;
  const th = newBbox.maxY - newBbox.minY;
  return points.map(p => ({
    x: sw === 0 ? (oldBbox.minX + oldBbox.maxX) / 2 : newBbox.minX + (p.x - oldBbox.minX) / sw * tw,
    y: sh === 0 ? (oldBbox.minY + oldBbox.maxY) / 2 : newBbox.minY + (p.y - oldBbox.minY) / sh * th,
  }));
}

const SEL_PAD = 10; // screen-px padding around selection bbox

function getSelectionLayout(
  selPath: DrawPath | null,
  vt: ViewTransform,
  cW: number, cH: number, iW: number, iH: number,
) {
  if (!selPath || selPath.points.length === 0) return null;
  const bbox = computeBBox(selPath.points);
  const tl = imagePctToScreenPx(bbox.minX, bbox.minY, vt, cW, cH, iW, iH);
  const br = imagePctToScreenPx(bbox.maxX, bbox.maxY, vt, cW, cH, iW, iH);
  const P = SEL_PAD;
  const rectX = Math.min(tl.x, br.x) - P;
  const rectY = Math.min(tl.y, br.y) - P;
  const rectW = Math.abs(br.x - tl.x) + 2 * P;
  const rectH = Math.abs(br.y - tl.y) + 2 * P;
  const tlX = Math.min(tl.x, br.x), tlY = Math.min(tl.y, br.y);
  const brX = Math.max(tl.x, br.x), brY = Math.max(tl.y, br.y);
  const handles: Array<{ x: number; y: number; hx: 0|1; hy: 0|1; cursor: string }> = [
    { x: tlX - P, y: tlY - P, hx: 0, hy: 0, cursor: 'nwse-resize' },
    { x: brX + P, y: tlY - P, hx: 1, hy: 0, cursor: 'nesw-resize' },
    { x: tlX - P, y: brY + P, hx: 0, hy: 1, cursor: 'nesw-resize' },
    { x: brX + P, y: brY + P, hx: 1, hy: 1, cursor: 'nwse-resize' },
  ];
  const deletePos = { x: brX + P + 1, y: tlY - P - 1 };
  return { bbox, rectX, rectY, rectW, rectH, handles, deletePos, tlX, tlY, brX, brY };
}

export default function DrawingCanvas({
  paths, isDrawingMode, tool, color, strokeWidth, opacity,
  viewTransform, containerW, containerH, imgW, imgH,
  selectedPathId, onSelectPath, onDeletePath,
  onDrawStart, onPathAdd, onPathsChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement | null>(null);
  const cursorGroupRef = useRef<SVGGElement>(null);
  const isActiveRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);
  const currentImagePtsRef = useRef<DrawPoint[]>([]);
  const currentScreenDRef = useRef('');
  const shapeStartRef = useRef<DrawPoint | null>(null);
  const eraserHistoryDoneRef = useRef(false);

  const propsRef = useRef({
    paths, tool, color, strokeWidth, opacity, viewTransform, containerW, containerH, imgW, imgH,
    selectedPathId, onSelectPath, onDeletePath, onDrawStart, onPathAdd, onPathsChange,
  });
  useEffect(() => {
    propsRef.current = {
      paths, tool, color, strokeWidth, opacity, viewTransform, containerW, containerH, imgW, imgH,
      selectedPathId, onSelectPath, onDeletePath, onDrawStart, onPathAdd, onPathsChange,
    };
  });

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

  useEffect(() => {
    if (isDrawingMode && tool === 'select') hideCursor();
  }, [tool, isDrawingMode, hideCursor]);

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
    const { paths: currentPaths, strokeWidth, viewTransform, containerW, containerH, imgW, imgH, onPathsChange, onDrawStart } = propsRef.current;
    const radius = strokeWidth * viewTransform.scale * 2.5;
    const wouldErase = currentPaths.some(path =>
      path.points.some(pt => {
        const sp = imagePctToScreenPx(pt.x, pt.y, viewTransform, containerW, containerH, imgW, imgH);
        return (sp.x - sx) ** 2 + (sp.y - sy) ** 2 < radius * radius;
      })
    );
    if (wouldErase && !eraserHistoryDoneRef.current) {
      onDrawStart();
      eraserHistoryDoneRef.current = true;
    }
    if (wouldErase) {
      onPathsChange((prevPaths: DrawPath[]) =>
        prevPaths.filter(path =>
          !path.points.some(pt => {
            const sp = imagePctToScreenPx(pt.x, pt.y, viewTransform, containerW, containerH, imgW, imgH);
            return (sp.x - sx) ** 2 + (sp.y - sy) ** 2 < radius * radius;
          })
        )
      );
    }
  }, []);

  useEffect(() => {
    if (!isDrawingMode) { hideCursor(); return; }
    const svg = svgRef.current;
    if (!svg) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      e.stopPropagation();
      const p = propsRef.current;
      const pos = getPointerPos(e);
      const { tool } = p;

      // ── SELECT MODE ──
      if (tool === 'select') {
        const { paths, selectedPathId, viewTransform, containerW, containerH, imgW, imgH, onSelectPath, onDeletePath } = p;
        const selPath = selectedPathId ? paths.find(x => x.id === selectedPathId) ?? null : null;
        const layout = getSelectionLayout(selPath, viewTransform, containerW, containerH, imgW, imgH);

        // 1. Delete button hit
        if (layout) {
          const dp = layout.deletePos;
          const delBtnX = dp.x + 14, delBtnY = dp.y - 14;
          if ((pos.x - delBtnX) ** 2 + (pos.y - delBtnY) ** 2 < 15 * 15) {
            onDeletePath(selectedPathId!);
            return;
          }
          // 2. Corner handle hit
          for (const h of layout.handles) {
            if (Math.abs(pos.x - h.x) < 9 && Math.abs(pos.y - h.y) < 9) {
              svg.setPointerCapture(e.pointerId);
              isActiveRef.current = true;
              dragRef.current = { type: 'handle', pathId: selectedPathId!, origPoints: selPath!.points, origBbox: layout.bbox, hx: h.hx, hy: h.hy, historyDone: false };
              return;
            }
          }
          // 3. Inside padded selection rect → move
          if (pos.x >= layout.rectX && pos.x <= layout.rectX + layout.rectW &&
              pos.y >= layout.rectY && pos.y <= layout.rectY + layout.rectH) {
            const imgPt = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);
            svg.setPointerCapture(e.pointerId);
            isActiveRef.current = true;
            dragRef.current = { type: 'move', pathId: selectedPathId!, origPoints: selPath!.points, startX: imgPt.x, startY: imgPt.y, historyDone: false };
            return;
          }
        }

        // 4. Hit-test all paths (reverse order = topmost first)
        const iW2 = imgW > 0 ? imgW : containerW;
        const iH2 = imgH > 0 ? imgH : containerH;
        const scaleY = iH2 > 0 ? iW2 / iH2 : 1; // normalize Y axis to X-axis scale
        const imgPt = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);
        let foundPath: DrawPath | null = null;
        for (let i = paths.length - 1; i >= 0; i--) {
          const path = paths[i];
          const hitPx = Math.max(10, path.width * viewTransform.scale / 2 + 6);
          const hitThresh = (hitPx / (viewTransform.scale * iW2)) * 100;
          if (isPathHit(imgPt, path, hitThresh * hitThresh, scaleY)) { foundPath = path; break; }
        }
        onSelectPath(foundPath ? foundPath.id : null);
        return;
      }

      // ── DRAWING MODES ──
      if (p.imgW === 0 || p.imgH === 0) return;
      isActiveRef.current = true;
      svg.setPointerCapture(e.pointerId);
      moveCursor(pos.x, pos.y);

      if (tool === 'eraser') { eraserHistoryDoneRef.current = false; eraseNearby(pos.x, pos.y); return; }
      onDrawStart();

      const imgPt = screenPxToImagePct(pos.x, pos.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH);
      if (tool === 'pen') {
        currentImagePtsRef.current = [imgPt];
        currentScreenDRef.current = `M ${pos.x} ${pos.y}`;
        createLivePath();
        if (livePathRef.current) {
          livePathRef.current.setAttribute('stroke', p.color);
          livePathRef.current.setAttribute('stroke-width', String(p.strokeWidth * p.viewTransform.scale));
          livePathRef.current.setAttribute('d', currentScreenDRef.current);
        }
      } else {
        shapeStartRef.current = imgPt;
        createLivePath();
        if (livePathRef.current) {
          livePathRef.current.setAttribute('stroke', p.color);
          livePathRef.current.setAttribute('stroke-width', String(p.strokeWidth * p.viewTransform.scale));
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const pos = getPointerPos(e);
      const p = propsRef.current;

      // ── SELECT MODE ──
      if (p.tool === 'select') {
        if (isActiveRef.current && dragRef.current) {
          e.preventDefault();
          const drag = dragRef.current;
          const { viewTransform, containerW, containerH, imgW, imgH, onPathsChange, onDrawStart } = p;
          if (!drag.historyDone) { onDrawStart(); drag.historyDone = true; }
          const imgPt = screenPxToImagePct(pos.x, pos.y, viewTransform, containerW, containerH, imgW, imgH);

          if (drag.type === 'move') {
            const dx = imgPt.x - drag.startX, dy = imgPt.y - drag.startY;
            const newPoints = drag.origPoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
            onPathsChange((prev: DrawPath[]) => prev.map(path => path.id === drag.pathId ? { ...path, points: newPoints } : path));
          } else {
            const { origBbox, hx, hy } = drag;
            const newBbox: BBox = {
              minX: hx === 0 ? Math.min(imgPt.x, origBbox.maxX) : origBbox.minX,
              minY: hy === 0 ? Math.min(imgPt.y, origBbox.maxY) : origBbox.minY,
              maxX: hx === 1 ? Math.max(imgPt.x, origBbox.minX) : origBbox.maxX,
              maxY: hy === 1 ? Math.max(imgPt.y, origBbox.minY) : origBbox.maxY,
            };
            const newPoints = remapPoints(drag.origPoints, origBbox, newBbox);
            onPathsChange((prev: DrawPath[]) => prev.map(path => path.id === drag.pathId ? { ...path, points: newPoints } : path));
          }
          return;
        }

        // Update cursor style based on hover position
        if (svg) {
          const { selectedPathId, paths, viewTransform, containerW, containerH, imgW, imgH } = p;
          const selPath = selectedPathId ? paths.find(x => x.id === selectedPathId) ?? null : null;
          const layout = getSelectionLayout(selPath, viewTransform, containerW, containerH, imgW, imgH);
          let cursor = 'default';
          if (layout) {
            const dp = layout.deletePos;
            const delBtnX = dp.x + 14, delBtnY = dp.y - 14;
            if ((pos.x - delBtnX) ** 2 + (pos.y - delBtnY) ** 2 < 15 * 15) {
              cursor = 'pointer';
            } else {
              for (const h of layout.handles) {
                if (Math.abs(pos.x - h.x) < 9 && Math.abs(pos.y - h.y) < 9) { cursor = h.cursor; break; }
              }
              if (cursor === 'default') {
                if (pos.x >= layout.rectX && pos.x <= layout.rectX + layout.rectW &&
                    pos.y >= layout.rectY && pos.y <= layout.rectY + layout.rectH) {
                  cursor = 'move';
                }
              }
            }
          }
          svg.style.cursor = cursor;
        }
        return;
      }

      // ── DRAWING MODES ──
      moveCursor(pos.x, pos.y);
      if (!isActiveRef.current) return;
      e.preventDefault();

      if (p.tool === 'eraser') { eraseNearby(pos.x, pos.y); return; }

      if (p.tool === 'pen') {
        const last = currentImagePtsRef.current[currentImagePtsRef.current.length - 1];
        const lastScreen = imagePctToScreenPx(last.x, last.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH);
        const dx = pos.x - lastScreen.x, dy = pos.y - lastScreen.y;
        if (dx * dx + dy * dy < 9) return;
        currentImagePtsRef.current.push(screenPxToImagePct(pos.x, pos.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH));
        currentScreenDRef.current += ` L ${pos.x} ${pos.y}`;
        if (livePathRef.current) livePathRef.current.setAttribute('d', currentScreenDRef.current);
      } else if (shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = screenPxToImagePct(pos.x, pos.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH);
        let pts: DrawPoint[] = [];
        if (p.tool === 'line') pts = [start, end];
        else if (p.tool === 'rect') pts = rectPoints(start.x, start.y, end.x, end.y);
        else if (p.tool === 'circle') { const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2; pts = circlePoints((start.x + end.x) / 2, (start.y + end.y) / 2, rx, ry); }
        if (livePathRef.current && pts.length) {
          const screenPts = pts.map(pt => imagePctToScreenPx(pt.x, pt.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH));
          livePathRef.current.setAttribute('d', ptsToSvgD(screenPts));
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const p = propsRef.current;

      // ── SELECT MODE ──
      if (p.tool === 'select') {
        if (isActiveRef.current) {
          isActiveRef.current = false;
          svg.releasePointerCapture(e.pointerId);
          dragRef.current = null;
          svg.style.cursor = 'default';
        }
        return;
      }

      // ── DRAWING MODES ──
      if (!isActiveRef.current) return;
      isActiveRef.current = false;
      svg.releasePointerCapture(e.pointerId);
      removeLivePath();
      const pos = getPointerPos(e);

      if (p.tool === 'eraser') return;

      if (p.tool === 'pen') {
        const pts = currentImagePtsRef.current;
        if (pts.length > 0) p.onPathAdd({ id: generateId(), points: pts, color: p.color, width: p.strokeWidth, opacity: p.opacity, tool: 'pen' });
        currentImagePtsRef.current = [];
        currentScreenDRef.current = '';
      } else if (shapeStartRef.current) {
        const start = shapeStartRef.current;
        const end = screenPxToImagePct(pos.x, pos.y, p.viewTransform, p.containerW, p.containerH, p.imgW, p.imgH);
        let pts: DrawPoint[] = [];
        if (p.tool === 'line') pts = [start, end];
        else if (p.tool === 'rect') pts = rectPoints(start.x, start.y, end.x, end.y);
        else if (p.tool === 'circle') { const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2; pts = circlePoints((start.x + end.x) / 2, (start.y + end.y) / 2, rx, ry); }
        if (pts.length >= 2) p.onPathAdd({ id: generateId(), points: pts, color: p.color, width: p.strokeWidth, opacity: p.opacity, tool: p.tool });
        shapeStartRef.current = null;
      }
    };

    const onPointerCancel = () => {
      if (!isActiveRef.current) return;
      isActiveRef.current = false;
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) {
        const { origPoints, pathId } = drag;
        propsRef.current.onPathsChange((prev: DrawPath[]) =>
          prev.map(p => p.id === pathId ? { ...p, points: origPoints } : p)
        );
      }
      removeLivePath();
      currentImagePtsRef.current = [];
      currentScreenDRef.current = '';
      shapeStartRef.current = null;
    };

    const onPointerLeave = () => { if (propsRef.current.tool !== 'select') hideCursor(); };

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
      svg.style.cursor = '';
      isActiveRef.current = false;
      dragRef.current = null;
    };
  }, [isDrawingMode, getPointerPos, moveCursor, hideCursor, eraseNearby, createLivePath, removeLivePath]);

  useEffect(() => {
    if (livePathRef.current) {
      livePathRef.current.setAttribute('stroke-width', String(strokeWidth * viewTransform.scale));
    }
  }, [viewTransform.scale, strokeWidth]);

  // Compute SVG group transform (image-% → screen px)
  const s = viewTransform.scale;
  const refW = imgW > 0 ? imgW : containerW;
  const refH = imgH > 0 ? imgH : containerH;
  const imgLeft = imgW > 0 ? (containerW - imgW) / 2 : 0;
  const imgTop  = imgH > 0 ? (containerH - imgH) / 2 : 0;
  const groupOx = (imgLeft - containerW / 2) * s + containerW / 2 + viewTransform.x;
  const groupOy = (imgTop  - containerH / 2) * s + containerH / 2 + viewTransform.y;
  const groupSx = s * refW / 100;
  const groupSy = s * refH / 100;

  // Cursor size
  const cursorR  = Math.max(4, strokeWidth * viewTransform.scale / 2);
  const eraserR  = Math.max(8, strokeWidth * viewTransform.scale * 2.5);

  // Selection layout
  const selectedPath = selectedPathId ? paths.find(p => p.id === selectedPathId) ?? null : null;
  const selLayout = tool === 'select' ? getSelectionLayout(selectedPath, viewTransform, containerW, containerH, imgW, imgH) : null;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full z-[12]"
      style={{
        pointerEvents: isDrawingMode ? 'auto' : 'none',
        cursor: isDrawingMode ? (tool === 'select' ? 'default' : 'none') : 'default',
        touchAction: 'none',
      }}
    >
      {/* Committed paths */}
      <g transform={`translate(${groupOx},${groupOy}) scale(${groupSx},${groupSy})`}>
        {imgW > 0 && imgH > 0 && paths.map(path => (
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

      {/* Selection overlay */}
      {imgW > 0 && imgH > 0 && selLayout && (
        <g pointerEvents="none">
          {/* Dashed bounding rect */}
          <rect
            x={selLayout.rectX} y={selLayout.rectY}
            width={selLayout.rectW} height={selLayout.rectH}
            fill="rgba(181,84,30,0.04)"
            stroke="#b5541e" strokeWidth={1.5} strokeDasharray="5 3"
            rx={3}
          />
          {/* Corner handles */}
          {selLayout.handles.map((h, i) => (
            <rect
              key={i}
              x={h.x - 6} y={h.y - 6}
              width={12} height={12}
              rx={2}
              fill="white"
              stroke="#b5541e"
              strokeWidth={1.5}
              style={{ cursor: h.cursor }}
            />
          ))}
          {/* Delete button: red circle with × above top-right handle */}
          <g transform={`translate(${selLayout.deletePos.x + 14},${selLayout.deletePos.y - 14})`} style={{ cursor: 'pointer' }}>
            <circle r={13} fill="#ef4444" stroke="white" strokeWidth={1.5} />
            <line x1={-4.5} y1={-4.5} x2={4.5} y2={4.5} stroke="white" strokeWidth={2} strokeLinecap="round" />
            <line x1={4.5} y1={-4.5} x2={-4.5} y2={4.5} stroke="white" strokeWidth={2} strokeLinecap="round" />
          </g>
        </g>
      )}

      {/* Custom cursor — always in DOM so ref is always valid; only shows content for non-select tools */}
      <g ref={cursorGroupRef} pointerEvents="none">
        {tool === 'eraser' ? (
          <>
            <circle r={eraserR} fill="rgba(200,200,200,0.12)" stroke="white" strokeWidth={1.5} />
            <circle r={eraserR} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
          </>
        ) : tool === 'select' ? null : (
          <>
            <circle r={cursorR + 1.5} fill="none" stroke="white" strokeWidth={2.5} opacity={0.85} />
            <circle r={cursorR} fill={color} fillOpacity={opacity / 100} stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
            {cursorR >= 8 && <circle r={1.5} fill="rgba(0,0,0,0.55)" />}
          </>
        )}
      </g>
    </svg>
  );
}
