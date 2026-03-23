import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo, lazy, Suspense, useCallback } from 'react';
import { useGestures } from '@/hooks/useGestures';
import { useLanguage } from '@/contexts/LanguageContext';

let pdfVersion = '';
const pdfVersionListeners: Array<(v: string) => void> = [];

const PdfDocument = lazy(() =>
  import('react-pdf').then((mod) => {
    pdfVersion = mod.pdfjs.version;
    mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;
    pdfVersionListeners.forEach((fn) => fn(pdfVersion));
    pdfVersionListeners.length = 0;
    return { default: mod.Document };
  })
);

const PdfPage = lazy(() =>
  import('react-pdf').then((mod) => ({ default: mod.Page }))
);

export interface PatternViewerHandle {
  screenToContent: (screenYPercent: number, screenHeightPercent: number) => { y: number; height: number };
  scrollToContentY: (contentYPercent: number) => void;
  goToRuler: () => void;
}

interface PatternViewerProps {
  fileUrl: string;
  fileType: 'image' | 'pdf';
  rulerYPercent?: number;
  onTransformChange?: (transform: { scale: number; x: number; y: number }, containerH: number, containerW: number) => void;
  onImageSize?: (w: number, h: number) => void;
  onResetRuler?: () => void;
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, onTransformChange, onImageSize, onResetRuler, contentOverlay, children }, ref) {
    const { transform, containerRef, handlers, zoomIn, zoomOut, panBy, setXY, resetTransform, setFullTransform, isPanning } = useGestures(0.5, 5);
    const { t } = useLanguage();
    const [pdfPages, setPdfPages] = useState(1);
    const [pdfVer, setPdfVer] = useState(pdfVersion);
    useEffect(() => {
      if (pdfVersion) { setPdfVer(pdfVersion); return; }
      const fn = (v: string) => setPdfVer(v);
      pdfVersionListeners.push(fn);
      return () => {
        const idx = pdfVersionListeners.indexOf(fn);
        if (idx !== -1) pdfVersionListeners.splice(idx, 1);
      };
    }, []);
    const pdfOptions = useMemo(() => ({
      cMapUrl: pdfVer ? `//unpkg.com/pdfjs-dist@${pdfVer}/cmaps/` : undefined,
      cMapPacked: true,
    }), [pdfVer]);
    const sizeRef = useRef<HTMLDivElement>(null);
    const contentItemRef = useRef<HTMLElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 3);

    // Keep a ref to the latest transform so ResizeObserver can read it without
    // being recreated on every pan/zoom frame.
    const transformRef = useRef(transform);
    useEffect(() => { transformRef.current = transform; }, [transform]);

    // Notify parent whenever transform OR container size changes
    const onTransformChangeRef = useRef(onTransformChange);
    useEffect(() => { onTransformChangeRef.current = onTransformChange; }, [onTransformChange]);

    // Report rendered image size to parent so it can use image-relative coordinates
    const onImageSizeRef = useRef(onImageSize);
    useEffect(() => { onImageSizeRef.current = onImageSize; }, [onImageSize]);
    const reportImageSize = useCallback(() => {
      const el = contentItemRef.current;
      if (!el || !onImageSizeRef.current) return;
      onImageSizeRef.current(el.offsetWidth, el.offsetHeight);
    }, []);

    useEffect(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const W = sizeRef.current?.clientWidth || 1;
      onTransformChange?.(transform, H, W);
    }, [transform, onTransformChange]);

    useEffect(() => {
      if (!sizeRef.current) return;
      const observer = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        setContainerWidth(width);
        onTransformChangeRef.current?.(transformRef.current, height, width);
        // Re-measure image size after layout, then clamp pan offset so content
        // stays visible after orientation/resize changes.
        requestAnimationFrame(() => {
          reportImageSize();
          const imgEl = contentItemRef.current;
          if (!imgEl) return;
          const s = transformRef.current.scale;
          const maxTy = Math.max(0, (imgEl.offsetHeight * s - height) / 2);
          const maxTx = Math.max(0, (imgEl.offsetWidth * s - width) / 2);
          const cx = Math.max(-maxTx, Math.min(maxTx, transformRef.current.x));
          const cy = Math.max(-maxTy, Math.min(maxTy, transformRef.current.y));
          if (cx !== transformRef.current.x || cy !== transformRef.current.y) {
            setXY(cx, cy);
          }
        });
      });
      observer.observe(sizeRef.current);
      return () => observer.disconnect();
    }, []);

    // Convert image-relative % to container-absolute px (content space)
    const imageToContentY = useCallback((imageYPct: number) => {
      const H = sizeRef.current?.clientHeight || 1;
      const imgH = contentItemRef.current?.offsetHeight || 0;
      if (imgH > 0) return (H - imgH) / 2 + (imageYPct / 100) * imgH;
      return (imageYPct / 100) * H;
    }, []);

    const goToRuler = useCallback(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const contentY = imageToContentY(rulerYPercent);
      setXY(transform.x, -(contentY - H / 2) * transform.scale);
    }, [rulerYPercent, imageToContentY, transform.x, transform.scale, setXY]);

    useImperativeHandle(ref, () => ({
      screenToContent(screenYPercent: number, screenHeightPercent: number) {
        const H = sizeRef.current?.clientHeight || 1;
        const { scale, y: ty } = transform;
        const screenY = (screenYPercent / 100) * H;
        const contentY = (screenY - H / 2 - ty) / scale + H / 2;
        return { y: (contentY / H) * 100, height: screenHeightPercent / scale };
      },
      scrollToContentY(imageYPercent: number) {
        const H = sizeRef.current?.clientHeight || 1;
        const contentY = imageToContentY(imageYPercent);
        setXY(transform.x, -(contentY - H / 2) * transform.scale);
      },
      goToRuler() {
        goToRuler();
      },
    }), [transform, setXY, imageToContentY, goToRuler]);

    // Scrollbar drag state
    const scrollDragRef = useRef<{
      axis: 'v' | 'h';
      startClient: number;
      startOffset: number;
      otherAxis: number;
      maxOffset: number;
      trackSize: number;
      thumbFrac: number;
    } | null>(null);

    const vTrackRef = useRef<HTMLDivElement>(null);
    const hTrackRef = useRef<HTMLDivElement>(null);

    const handleScrollThumbDown = useCallback(
      (axis: 'v' | 'h') => (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        const H = sizeRef.current?.clientHeight || 1;
        const W = sizeRef.current?.clientWidth || 1;
        const s = transform.scale;
        const trackEl = axis === 'v' ? vTrackRef.current : hTrackRef.current;
        if (!trackEl) return;
        const trackSize = axis === 'v' ? trackEl.clientHeight : trackEl.clientWidth;
        const containerSize = axis === 'v' ? H : W;
        const imgSize = axis === 'v'
          ? (contentItemRef.current?.offsetHeight || containerSize)
          : (contentItemRef.current?.offsetWidth || containerSize);
        const maxOffset = Math.max(0, (imgSize * s - containerSize) / 2);
        const thumbFrac = Math.min(1, containerSize / Math.max(imgSize * s, containerSize));
        scrollDragRef.current = {
          axis,
          startClient: axis === 'v' ? e.clientY : e.clientX,
          startOffset: axis === 'v' ? transform.y : transform.x,
          otherAxis: axis === 'v' ? transform.x : transform.y,
          maxOffset,
          trackSize,
          thumbFrac,
        };
      },
      [transform]
    );

    const handleScrollPointerMove = useCallback(
      (e: React.PointerEvent) => {
        const d = scrollDragRef.current;
        if (!d) return;
        e.stopPropagation();
        const client = d.axis === 'v' ? e.clientY : e.clientX;
        const delta = client - d.startClient;
        const thumbPx = d.trackSize * d.thumbFrac;
        const scrollable = d.trackSize - thumbPx;
        if (scrollable <= 0) return;
        const newOffset = d.startOffset - delta * (2 * d.maxOffset) / scrollable;
        const clamped = Math.max(-d.maxOffset, Math.min(d.maxOffset, newOffset));
        if (d.axis === 'v') {
          setXY(d.otherAxis, clamped);
        } else {
          setXY(clamped, d.otherAxis);
        }
      },
      [setXY]
    );

    const handleScrollPointerUp = useCallback(() => {
      scrollDragRef.current = null;
    }, []);


    // Scrollbar linger: stay visible for 2s after panning ends
    const [scrollbarVisible, setScrollbarVisible] = useState(false);
    const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (isPanning) {
        if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
        setScrollbarVisible(true);
      } else {
        lingerTimerRef.current = setTimeout(() => setScrollbarVisible(false), 2000);
      }
      return () => {
        if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
      };
    }, [isPanning]);

    // Compute scrollbar thumb positions based on actual content (image) size
    const H = sizeRef.current?.clientHeight || 1;
    const W = sizeRef.current?.clientWidth || 1;
    const s = transform.scale;
    const cImgH = contentItemRef.current?.offsetHeight || H;
    const cImgW = contentItemRef.current?.offsetWidth || W;

    const vMaxTy = Math.max(0, (cImgH * s - H) / 2);
    const vThumbFrac = Math.min(1, H / Math.max(cImgH * s, H));
    const vScrollPos = vMaxTy > 0 ? (vMaxTy - transform.y) / (2 * vMaxTy) : 0.5;
    const vThumbTop = Math.max(0, Math.min(1 - vThumbFrac, vScrollPos * (1 - vThumbFrac)));

    const hMaxTx = Math.max(0, (cImgW * s - W) / 2);
    const hThumbFrac = Math.min(1, W / Math.max(cImgW * s, W));
    const hScrollPos = hMaxTx > 0 ? (hMaxTx - transform.x) / (2 * hMaxTx) : 0.5;
    const hThumbLeft = Math.max(0, Math.min(1 - hThumbFrac, hScrollPos * (1 - hThumbFrac)));

    const showScrollbars = scrollbarVisible || vMaxTy > 1 || hMaxTx > 1;

    return (
      <div className="relative w-full h-full overflow-hidden bg-gray-50 rounded-xl" ref={sizeRef}>
        <div
          ref={containerRef}
          className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
          {...handlers}
        >
          <div
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: 'center center',
              transition: 'none',
            }}
            className="relative w-full h-full flex items-center justify-center"
          >
            {fileType === 'image' ? (
              <img
                ref={(el) => { contentItemRef.current = el; }}
                src={fileUrl}
                alt="패턴"
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                draggable={false}
                onLoad={reportImageSize}
              />
            ) : (
              <Suspense fallback={<div className="w-8 h-8 border-2 border-[#b5541e] border-t-transparent rounded-full animate-spin" />}>
                <div ref={(el) => { contentItemRef.current = el; }} className="flex flex-col items-center gap-2">
                  <PdfDocument
                    file={fileUrl}
                    onLoadSuccess={({ numPages }: { numPages: number }) => setPdfPages(numPages)}
                    options={pdfOptions}
                    className="flex flex-col items-center gap-2"
                  >
                    {Array.from({ length: pdfPages }, (_, i) => (
                      <PdfPage
                        key={i + 1}
                        pageNumber={i + 1}
                        width={containerWidth * 0.9}
                        scale={devicePixelRatio}
                        renderTextLayer={false}
                        renderAnnotationLayer={true}
                        onRenderSuccess={reportImageSize}
                      />
                    ))}
                  </PdfDocument>
                </div>
              </Suspense>
            )}

            {contentOverlay}
          </div>
        </div>

        {/* Fixed overlays (ruler) */}
        {children}

        {/* Vertical scrollbar — stops above zoom buttons (bottom ~112px) */}
        {showScrollbars && (
          <div ref={vTrackRef} className="absolute right-1 top-2 bottom-28 w-3 z-25">
            <div className="relative w-full h-full">
              <div
                className="absolute right-0 w-1.5 rounded-full bg-[#3d2b1f]/20"
                style={{ top: 0, bottom: 0 }}
              />
              <div
                className="absolute right-0 w-1.5 rounded-full bg-[#3d2b1f]/50 hover:bg-[#b5541e]/70 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
                style={{ top: `${vThumbTop * 100}%`, height: `${vThumbFrac * 100}%` }}
                onPointerDown={handleScrollThumbDown('v')}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerMove={handleScrollPointerMove}
                onPointerUp={handleScrollPointerUp}
                onPointerCancel={handleScrollPointerUp}
              />
            </div>
          </div>
        )}

        {/* Horizontal scrollbar — right edge avoids zoom buttons (right ~80px) */}
        {showScrollbars && (
          <div ref={hTrackRef} className="absolute bottom-1 left-20 right-20 h-3 z-25">
            <div className="relative w-full h-full">
              <div
                className="absolute bottom-0 h-1.5 rounded-full bg-[#3d2b1f]/20"
                style={{ left: 0, right: 0 }}
              />
              <div
                className="absolute bottom-0 h-1.5 rounded-full bg-[#3d2b1f]/50 hover:bg-[#b5541e]/70 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
                style={{ left: `${hThumbLeft * 100}%`, width: `${hThumbFrac * 100}%` }}
                onPointerDown={handleScrollThumbDown('h')}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerMove={handleScrollPointerMove}
                onPointerUp={handleScrollPointerUp}
                onPointerCancel={handleScrollPointerUp}
              />
            </div>
          </div>
        )}

        {/* Zoom controls — bottom-right */}
        <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 flex flex-col items-stretch gap-0 z-20 w-14">
          <button
            onClick={zoomIn}
            className="h-11 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-t-xl border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] text-xl font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label="확대"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="h-11 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-b-xl border-2 border-t-0 border-[#d4b896] flex items-center justify-center text-[#7a5c46] text-xl font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label="축소"
          >
            −
          </button>
        </div>

        {/* Ruler navigation — bottom-left */}
        <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 flex flex-col items-stretch gap-1.5 z-20 w-16">
          <button
            onClick={goToRuler}
            className="h-12 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-xl border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label={t('viewer.goToRuler')}
          >
            <span className="text-[10px] font-bold leading-snug text-center whitespace-pre-line">{t('viewer.goToRuler')}</span>
          </button>

          {onResetRuler && (
            <button
              onClick={onResetRuler}
              className="h-12 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-xl border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
              aria-label={t('viewer.bringRuler')}
            >
              <span className="text-[10px] font-bold leading-snug text-center whitespace-pre-line">{t('viewer.bringRuler')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }
);

export default PatternViewer;
