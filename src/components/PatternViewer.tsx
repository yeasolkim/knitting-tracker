import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useMemo, lazy, Suspense } from 'react';
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
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, rulerHeightPercent = 5, onScrollStep, contentOverlay, children }, ref) {
    const { transform, containerRef, handlers, zoomIn, zoomOut, panBy, resetTransform } = useGestures(0.5, 5, rulerYPercent, rulerHeightPercent);
    const [pdfPages, setPdfPages] = useState(1);
    const pdfOptions = useMemo(() => ({
      cMapUrl: `//unpkg.com/pdfjs-dist@${pdfVersion}/cmaps/`,
      cMapPacked: true,
    }), []);
    const sizeRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(600);

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
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                  ))}
                </PdfDocument>
              </Suspense>
            )}

            {/* Completed marks - moves with content */}
            {contentOverlay}
          </div>
        </div>

        {/* Fixed overlays (ruler) */}
        {children}

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
