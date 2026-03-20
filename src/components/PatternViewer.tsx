import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo, lazy, Suspense, useCallback } from 'react';
import { useGestures } from '@/hooks/useGestures';

let pdfVersion = '';

const PdfDocument = lazy(() =>
  import('react-pdf').then((mod) => {
    pdfVersion = mod.pdfjs.version;
    mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
    return { default: mod.Document };
  })
);

const PdfPage = lazy(() =>
  import('react-pdf').then((mod) => ({ default: mod.Page }))
);

export interface PatternViewerHandle {
  screenToContent: (screenYPercent: number, screenHeightPercent: number) => { y: number; height: number };
}

interface PatternViewerProps {
  fileUrl: string;
  fileType: 'image' | 'pdf';
  rulerYPercent?: number;
  rulerHeightPercent?: number;
  onScrollStep?: (direction: 'up' | 'down') => void;
  onScaleChange?: (newScale: number, oldScale: number) => void;
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, rulerHeightPercent = 5, onScrollStep, onScaleChange, contentOverlay, children }, ref) {
    const { transform, containerRef, handlers, zoomIn, zoomOut, panBy, setXY, resetTransform } = useGestures(0.5, 5, rulerYPercent, rulerHeightPercent);
    const [pdfPages, setPdfPages] = useState(1);
    const pdfOptions = useMemo(() => ({
      cMapUrl: `//unpkg.com/pdfjs-dist@${pdfVersion}/cmaps/`,
      cMapPacked: true,
    }), []);
    const sizeRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(600);
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 3);

    // Notify parent when scale changes so ruler can scale with zoom
    const prevScaleRef = useRef(1);
    useEffect(() => {
      const prev = prevScaleRef.current;
      if (transform.scale !== prev) {
        onScaleChange?.(transform.scale, prev);
        prevScaleRef.current = transform.scale;
      }
    }, [transform.scale, onScaleChange]);

    useEffect(() => {
      if (!sizeRef.current) return;
      const observer = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
      });
      observer.observe(sizeRef.current);
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      screenToContent(screenYPercent: number, screenHeightPercent: number) {
        const H = sizeRef.current?.clientHeight || 1;
        const { scale, y: ty } = transform;

        const screenY = (screenYPercent / 100) * H;
        const contentY = (screenY - H / 2 - ty) / scale + H / 2;
        const contentYPercent = (contentY / H) * 100;

        const contentHeightPercent = screenHeightPercent / scale;

        return { y: contentYPercent, height: contentHeightPercent };
      },
    }), [transform]);

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
        const maxOffset = ((axis === 'v' ? H : W) * (s - 1)) / 2;
        scrollDragRef.current = {
          axis,
          startClient: axis === 'v' ? e.clientY : e.clientX,
          startOffset: axis === 'v' ? transform.y : transform.x,
          otherAxis: axis === 'v' ? transform.x : transform.y,
          maxOffset,
          trackSize,
          thumbFrac: 1 / s,
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

    // Compute scrollbar thumb positions
    const H = sizeRef.current?.clientHeight || 1;
    const W = sizeRef.current?.clientWidth || 1;
    const s = transform.scale;
    const showScrollbars = s > 1.05;

    const vThumbFrac = 1 / s;
    const vMaxTy = (H * (s - 1)) / 2;
    const vScrollPos = vMaxTy > 0 ? (vMaxTy - transform.y) / (2 * vMaxTy) : 0.5;
    const vThumbTop = Math.max(0, Math.min(1 - vThumbFrac, vScrollPos * (1 - vThumbFrac)));

    const hThumbFrac = 1 / s;
    const hMaxTx = (W * (s - 1)) / 2;
    const hScrollPos = hMaxTx > 0 ? (hMaxTx - transform.x) / (2 * hMaxTx) : 0.5;
    const hThumbLeft = Math.max(0, Math.min(1 - hThumbFrac, hScrollPos * (1 - hThumbFrac)));

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
                src={fileUrl}
                alt="패턴"
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
            ) : (
              <Suspense fallback={<div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />}>
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
                      renderAnnotationLayer={false}
                    />
                  ))}
                </PdfDocument>
              </Suspense>
            )}

            {contentOverlay}
          </div>
        </div>

        {/* Fixed overlays (ruler) */}
        {children}

        {/* Vertical scrollbar */}
        {showScrollbars && (
          <div
            ref={vTrackRef}
            className="absolute right-1 top-2 bottom-14 w-1.5 z-25 pointer-events-none"
            onPointerMove={handleScrollPointerMove}
            onPointerUp={handleScrollPointerUp}
            onPointerCancel={handleScrollPointerUp}
          >
            <div className="relative w-full h-full rounded-full bg-black/8">
              <div
                className="absolute w-full rounded-full bg-gray-500/40 hover:bg-gray-600/50 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
                style={{
                  top: `${vThumbTop * 100}%`,
                  height: `${vThumbFrac * 100}%`,
                }}
                onPointerDown={handleScrollThumbDown('v')}
              />
            </div>
          </div>
        )}

        {/* Horizontal scrollbar */}
        {showScrollbars && (
          <div
            ref={hTrackRef}
            className="absolute bottom-1 left-2 right-14 h-1.5 z-25 pointer-events-none"
            onPointerMove={handleScrollPointerMove}
            onPointerUp={handleScrollPointerUp}
            onPointerCancel={handleScrollPointerUp}
          >
            <div className="relative w-full h-full rounded-full bg-black/8">
              <div
                className="absolute h-full rounded-full bg-gray-500/40 hover:bg-gray-600/50 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
                style={{
                  left: `${hThumbLeft * 100}%`,
                  width: `${hThumbFrac * 100}%`,
                }}
                onPointerDown={handleScrollThumbDown('h')}
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 flex flex-col gap-1 z-20">
          <button
            onClick={() => {
              const H = sizeRef.current?.clientHeight || 1;
              const px = (rulerHeightPercent / 100) * H * transform.scale;
              panBy(0, px);
              onScrollStep?.('up');
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-white/90 rounded-lg shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            aria-label="한 단 위로"
            title="한 단 위로"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={() => {
              const H = sizeRef.current?.clientHeight || 1;
              const px = (rulerHeightPercent / 100) * H * transform.scale;
              panBy(0, -px);
              onScrollStep?.('down');
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-white/90 rounded-lg shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            aria-label="한 단 아래로"
            title="한 단 아래로"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div className="h-0.5 sm:h-1" />

          <button
            onClick={zoomIn}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-white/90 rounded-lg shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            aria-label="확대"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-white/90 rounded-lg shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100"
            aria-label="축소"
          >
            −
          </button>
          <button
            onClick={resetTransform}
            className="w-9 h-9 sm:w-auto bg-white/90 rounded-lg shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:bg-gray-100 text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-1 sm:py-1.5 leading-tight text-center"
            aria-label="화면 맞춤"
          >
            <span className="sm:hidden">맞춤</span>
            <span className="hidden sm:inline">화면<br />맞춤</span>
          </button>
        </div>
      </div>
    );
  }
);

export default PatternViewer;
