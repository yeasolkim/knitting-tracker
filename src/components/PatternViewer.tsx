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
  scrollToContentY: (contentYPercent: number) => void;
}

interface PatternViewerProps {
  fileUrl: string;
  fileType: 'image' | 'pdf';
  rulerYPercent?: number;
  rulerHeightPercent?: number;
  onScrollStep?: (direction: 'up' | 'down') => void;
  onTransformChange?: (transform: { scale: number; x: number; y: number }, containerH: number, containerW: number) => void;
  onResetRuler?: () => void;
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, rulerHeightPercent = 5, onScrollStep, onTransformChange, onResetRuler, contentOverlay, children }, ref) {
    const { transform, containerRef, handlers, zoomIn, zoomOut, panBy, setXY, resetTransform, setFullTransform, isPanning } = useGestures(0.5, 5);
    const [pdfPages, setPdfPages] = useState(1);
    const pdfOptions = useMemo(() => ({
      cMapUrl: `//unpkg.com/pdfjs-dist@${pdfVersion}/cmaps/`,
      cMapPacked: true,
    }), []);
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
        // Notify parent of new dimensions so content↔screen conversions stay accurate
        onTransformChangeRef.current?.(transformRef.current, height, width);
      });
      observer.observe(sizeRef.current);
      return () => observer.disconnect();
    }, []);

    const fitToRuler = useCallback(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const W = sizeRef.current?.clientWidth || 1;
      const contentW = contentItemRef.current?.offsetWidth;
      if (!contentW || contentW <= 0) return;
      const newScale = Math.min(5, Math.max(0.5, W / contentW));
      const contentY = (rulerYPercent / 100) * H;
      const newTy = -(contentY - H / 2) * newScale;
      setFullTransform({ scale: newScale, x: 0, y: newTy });
    }, [rulerYPercent, setFullTransform]);

    useImperativeHandle(ref, () => ({
      screenToContent(screenYPercent: number, screenHeightPercent: number) {
        const H = sizeRef.current?.clientHeight || 1;
        const { scale, y: ty } = transform;
        const screenY = (screenYPercent / 100) * H;
        const contentY = (screenY - H / 2 - ty) / scale + H / 2;
        return { y: (contentY / H) * 100, height: screenHeightPercent / scale };
      },
      scrollToContentY(contentYPercent: number) {
        const H = sizeRef.current?.clientHeight || 1;
        const contentY = (contentYPercent / 100) * H;
        // Set ty so the ruler center appears at screen center
        setXY(transform.x, -(contentY - H / 2) * transform.scale);
      },
    }), [transform, setXY]);

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

    // Long-press continuous scroll with acceleration
    const scrollRepeatRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopScrollRepeat = useCallback(() => {
      if (scrollRepeatRef.current) { clearTimeout(scrollRepeatRef.current); scrollRepeatRef.current = null; }
      if (scrollTimeoutRef.current) { clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = null; }
    }, []);

    const makeScrollPressHandlers = useCallback((dir: 'up' | 'down') => {
      const doScroll = () => {
        const H = sizeRef.current?.clientHeight || 1;
        const px = (rulerHeightPercent / 100) * H * transform.scale;
        panBy(0, dir === 'up' ? px : -px);
        onScrollStep?.(dir);
      };
      return {
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          doScroll();
          // After initial delay, start accelerating repeat
          scrollTimeoutRef.current = setTimeout(() => {
            let interval = 280;
            const scheduleNext = () => {
              scrollRepeatRef.current = setTimeout(() => {
                doScroll();
                interval = Math.max(40, interval * 0.80);
                scheduleNext();
              }, interval);
            };
            scheduleNext();
          }, 400);
        },
        onPointerUp: stopScrollRepeat,
        onPointerLeave: stopScrollRepeat,
        onPointerCancel: stopScrollRepeat,
      };
    }, [rulerHeightPercent, transform.scale, panBy, onScrollStep, stopScrollRepeat]);

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
                ref={(el) => { contentItemRef.current = el; }}
                src={fileUrl}
                alt="패턴"
                className="max-w-full max-h-full object-contain select-none pointer-events-none"
                draggable={false}
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
                        renderAnnotationLayer={false}
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

        {/* Right-edge scroll buttons — visible only while panning */}
        <div
          className={`absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20 transition-all duration-200 ${
            isPanning ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            {...makeScrollPressHandlers('up')}
            className="w-10 h-10 bg-[#3d2b1f]/70 backdrop-blur-sm rounded-xl flex items-center justify-center text-[#fdf6e8] touch-none select-none active:bg-[#3d2b1f]/90"
            aria-label="한 단 위로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            {...makeScrollPressHandlers('down')}
            className="w-10 h-10 bg-[#3d2b1f]/70 backdrop-blur-sm rounded-xl flex items-center justify-center text-[#fdf6e8] touch-none select-none active:bg-[#3d2b1f]/90"
            aria-label="한 단 아래로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Bottom-edge pan buttons — visible only while panning */}
        <div
          className={`absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-row gap-1.5 z-20 transition-all duration-200 ${
            isPanning ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); panBy(W * 0.15, 0); }}
            className="w-10 h-10 bg-[#3d2b1f]/70 backdrop-blur-sm rounded-xl flex items-center justify-center text-[#fdf6e8] touch-none select-none active:bg-[#3d2b1f]/90"
            aria-label="왼쪽으로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); panBy(-W * 0.15, 0); }}
            className="w-10 h-10 bg-[#3d2b1f]/70 backdrop-blur-sm rounded-xl flex items-center justify-center text-[#fdf6e8] touch-none select-none active:bg-[#3d2b1f]/90"
            aria-label="오른쪽으로"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Fixed controls — always visible */}
        <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 flex flex-col gap-1 z-20">
          <div className="h-1" />

          <button
            onClick={zoomIn}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-lg border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] text-lg font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label="확대"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-lg border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] text-lg font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label="축소"
          >
            −
          </button>

          <div className="h-1" />

          {/* 진행선 맞춤: 가로 폭 맞추고 진행선으로 이동 */}
          <button
            onClick={fitToRuler}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-lg border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label="가로 맞춤 후 진행선으로 이동"
            title="가로 맞춤 + 진행선으로"
          >
            {/* ←|→ icon representing fit-width + go to ruler */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
              <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" strokeDasharray="2 2" />
            </svg>
          </button>

          {onResetRuler && (
            <>
              <div className="h-1" />
              <button
                onClick={onResetRuler}
                className="w-9 h-9 sm:w-10 sm:h-10 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-lg border-2 border-[#d4b896] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
                aria-label="진행선 위치 초기화"
                title="진행선 초기화"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
);

export default PatternViewer;
