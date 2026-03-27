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
  fitWidthTop: () => void;
  restoreTransform: (scale: number, x: number, y: number) => void;
}

interface PatternViewerProps {
  fileUrl: string;
  fileType: 'image' | 'pdf';
  rulerYPercent?: number;
  rulerXPercent?: number;
  onTransformChange?: (transform: { scale: number; x: number; y: number }, containerH: number, containerW: number) => void;
  onImageSize?: (w: number, h: number) => void;
  onResetRuler?: () => void;
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

const GAP = 8; // px gap between PDF pages (matches gap-2 = 0.5rem = 8px)

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, rulerXPercent, onTransformChange, onImageSize, onResetRuler, contentOverlay, children }, ref) {
    // Content size ref: kept up-to-date so useGestures can clamp pan bounds
    // DURING gestures, preventing the end-of-gesture snap that shifts the ruler.
    const contentSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
    const { transform, containerRef, handlers, zoomIn, zoomOut, panBy, setXY, resetTransform, setFullTransform, isPanning } = useGestures(0.5, 10, contentSizeRef);
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
    // Stable ref so async callbacks (onLoadSuccess) can read latest containerWidth
    const containerWidthRef = useRef(containerWidth);
    useEffect(() => { containerWidthRef.current = containerWidth; }, [containerWidth]);

    // PDF render DPR: base quality + higher when zoomed in (debounced)
    const baseDpr = window.devicePixelRatio || 1;
    const pw = containerWidth * 0.9;
    const basePdfDpr = containerWidth > 0 ? Math.max(baseDpr, Math.ceil(2000 / pw)) : baseDpr;
    const [pdfRenderDpr, setPdfRenderDpr] = useState(0);
    const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (fileType !== 'pdf' || pw <= 0) return;
      const maxDpr = Math.floor(5000 / pw);
      const targetDpr = transform.scale >= 2 ? maxDpr : Math.max(basePdfDpr, Math.min(Math.ceil(basePdfDpr * transform.scale / 1.2), maxDpr));
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      renderTimerRef.current = setTimeout(() => setPdfRenderDpr(targetDpr), 500);
      return () => { if (renderTimerRef.current) clearTimeout(renderTimerRef.current); };
    }, [transform.scale, pw, basePdfDpr, fileType]);
    const effectivePdfDpr = pdfRenderDpr || basePdfDpr;

    // PDF page dimensions
    // pdfPageAspectRatio: page-0 h/w ratio (for memory budget calc)
    const [pdfPageAspectRatio, setPdfPageAspectRatio] = useState(1.414); // A4 default
    // pdfFirstPageHeightRef: CSS px height of page 0 at current pw (fallback for unmeasured pages)
    const pdfFirstPageHeightRef = useRef(0);
    // pageAspectRatiosRef: h/w ratio for EVERY page, pre-parsed from PDF metadata in onLoadSuccess.
    // Available immediately before any page renders → accurate total height from the start.
    const pageAspectRatiosRef = useRef<number[]>([]);
    // pageHeightsRef: actual DOM-measured CSS heights, updated in onRenderSuccess.
    // More accurate than aspect-ratio × pw because react-pdf may round sub-pixel heights.
    const pageHeightsRef = useRef<number[]>([]);
    // true once onLoadSuccess pre-parsing completes (or fails).
    // onRenderSuccess defers reportImageSize() until this is true so that
    // goToRuler() never fires with an incomplete total height.
    const preParseDoneRef = useRef(false);
    // React state mirror of preParseDoneRef — setting this triggers a re-render
    // so that the reportImageSize() effect runs AFTER pdfPages state is updated.
    const [preParseDone, setPreParseDone] = useState(false);

    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 2 });

    // Reset all page measurements when the PDF file changes.
    useEffect(() => {
      pdfFirstPageHeightRef.current = 0;
      pageAspectRatiosRef.current = [];
      pageHeightsRef.current = [];
      preParseDoneRef.current = false;
      setPreParseDone(false);
    }, [fileUrl]);

    // Keep a ref to the latest transform so ResizeObserver can read it without
    // being recreated on every pan/zoom frame.
    const transformRef = useRef(transform);
    useEffect(() => { transformRef.current = transform; }, [transform]);

    // Notify parent whenever transform OR container size changes
    const onTransformChangeRef = useRef(onTransformChange);
    useEffect(() => { onTransformChangeRef.current = onTransformChange; }, [onTransformChange]);

    /**
     * Get CSS height for page i (0-based) at given pw.
     * Priority: DOM measurement > pre-parsed ratio > page-0 height > fallback estimate.
     */
    const getPageCssHeight = useCallback((i: number, currentPw: number): number => {
      if (pageHeightsRef.current[i] > 0) return pageHeightsRef.current[i];
      if (pageAspectRatiosRef.current[i] > 0) return pageAspectRatiosRef.current[i] * currentPw;
      if (pdfFirstPageHeightRef.current > 0) return pdfFirstPageHeightRef.current;
      return Math.round(currentPw * pdfPageAspectRatio);
    }, [pdfPageAspectRatio]);

    /**
     * Stable total content dimensions.
     * For PDFs: sums individually known page heights so mixed portrait/landscape PDFs
     * report the correct total height even before every page has rendered.
     * Uses DOM offsetWidth for width (avoids containerWidth dep — reads live value).
     */
    const getStableContentDims = useCallback(() => {
      const el = contentItemRef.current;
      const w = el?.offsetWidth || 0;
      let h = el?.offsetHeight || 0;
      if (fileType === 'pdf' && pdfPages > 0) {
        // Use DOM offsetWidth as pw when available (accurate); fall back to containerWidth.
        const currentPw = w || containerWidthRef.current * 0.9 || 540;
        let total = 0;
        for (let i = 0; i < pdfPages; i++) {
          total += getPageCssHeight(i, currentPw);
        }
        if (total > 0) h = total + GAP * Math.max(0, pdfPages - 1);
      }
      return { w, h };
    }, [fileType, pdfPages, getPageCssHeight]);

    // Report rendered image size to parent so it can use image-relative coordinates
    const onImageSizeRef = useRef(onImageSize);
    useEffect(() => { onImageSizeRef.current = onImageSize; }, [onImageSize]);
    const reportImageSize = useCallback(() => {
      const { w, h } = getStableContentDims();
      // Keep contentSizeRef in sync so useGestures can clamp during gestures
      if (w > 0 || h > 0) contentSizeRef.current = { w, h };
      if (onImageSizeRef.current && (w > 0 || h > 0)) onImageSizeRef.current(w, h);
    }, [getStableContentDims]);

    // When pre-parsing finishes, report the image size using the updated pdfPages state.
    // This effect runs AFTER React commits the render with the new pdfPages value,
    // so getStableContentDims() sees the correct page count (not the stale closure value).
    useEffect(() => {
      if (preParseDone && pdfPages > 0) {
        reportImageSize();
      }
    }, [preParseDone, pdfPages, reportImageSize]);

    useEffect(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const W = sizeRef.current?.clientWidth || 1;

      // Pan bounds clamping — only when user is NOT actively interacting.
      // IMPORTANT: compute clamped transform BEFORE notifying the parent so
      // PatternView never renders with the pre-clamp (wrong) transform values,
      // which would make the ruler jump to a wrong screen position.
      if (!isPanning) {
        const { w: imgW, h: imgH } = getStableContentDims();
        if (imgW > 0 && imgH > 0) {
          const { scale, x, y } = transform;
          const maxTy = Math.max(0, (imgH * scale - H) / 2);
          const maxTx = Math.max(0, (imgW * scale - W) / 2);
          const cx = Math.max(-maxTx, Math.min(maxTx, x));
          const cy = Math.max(-maxTy, Math.min(maxTy, y));
          if (cx !== x || cy !== y) {
            // Tell the parent the clamped position immediately so the ruler
            // renders at the correct location on this very frame.
            onTransformChange?.({ ...transform, x: cx, y: cy }, H, W);
            setXY(cx, cy);
            return;
          }
        }
      }

      onTransformChange?.(transform, H, W);
    }, [transform, onTransformChange, setXY, isPanning, getStableContentDims]);

    // Recalculate visible PDF page range whenever transform changes.
    // Uses per-page heights for accurate cumulative offsets so mixed-size PDFs
    // always render the correct pages (not estimated from page-0 height alone).
    useEffect(() => {
      if (fileType !== 'pdf' || pdfPages === 0) return;
      const H = sizeRef.current?.clientHeight || 600;
      const currentPw = containerWidth * 0.9;

      // Build cumulative Y offsets for each page
      const offsets: number[] = [];
      const heights: number[] = [];
      let totalH = 0;
      for (let i = 0; i < pdfPages; i++) {
        offsets[i] = totalH;
        const ph = getPageCssHeight(i, currentPw);
        heights[i] = ph;
        totalH += ph + (i < pdfPages - 1 ? GAP : 0);
      }
      if (totalH <= 0) return;

      const contentTop = -totalH / 2;
      const { scale, y } = transform;

      // Dynamic buffer: reduce when DPR is high to stay within ~220MB memory budget
      const canvasW = currentPw * effectivePdfDpr;
      const pageMemMB = (canvasW * canvasW * pdfPageAspectRatio * 4) / (1024 * 1024);
      const maxPages = Math.max(1, Math.floor(220 / pageMemMB));
      const BUFFER = Math.min(3, Math.max(0, Math.floor((maxPages - 1) / 2)));

      const viewTop = -y / scale - H / (2 * scale);
      const viewBottom = -y / scale + H / (2 * scale);

      // Find pages overlapping the viewport
      let start = pdfPages;
      let end = -1;
      for (let i = 0; i < pdfPages; i++) {
        const pageTop = contentTop + offsets[i];
        const pageBottom = pageTop + heights[i];
        if (pageBottom > viewTop && pageTop < viewBottom) {
          if (i < start) start = i;
          if (i > end) end = i;
        }
      }
      // Fallback: if nothing detected (shouldn't happen), show first page
      if (start > end) { start = 0; end = 0; }

      start = Math.max(0, start - BUFFER);
      end = Math.min(pdfPages - 1, end + BUFFER);

      setVisibleRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    }, [transform, pdfPages, pdfPageAspectRatio, containerWidth, fileType, effectivePdfDpr, getPageCssHeight]);

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
          const { w: iW, h: iH } = getStableContentDims();
          if (iW === 0 || iH === 0) return;
          const s = transformRef.current.scale;
          const maxTy = Math.max(0, (iH * s - height) / 2);
          const maxTx = Math.max(0, (iW * s - width) / 2);
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
      const { h: imgH } = getStableContentDims();
      if (imgH > 0) return (H - imgH) / 2 + (imageYPct / 100) * imgH;
      return (imageYPct / 100) * H;
    }, [getStableContentDims]);

    const imageToContentX = useCallback((imageXPct: number) => {
      const W = sizeRef.current?.clientWidth || 1;
      const { w: imgW } = getStableContentDims();
      if (imgW > 0) return (W - imgW) / 2 + (imageXPct / 100) * imgW;
      return (imageXPct / 100) * W;
    }, [getStableContentDims]);

    const goToRuler = useCallback(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const W = sizeRef.current?.clientWidth || 1;
      const contentY = imageToContentY(rulerYPercent);
      const newY = -(contentY - H / 2) * transform.scale;
      if (rulerXPercent !== undefined) {
        const contentX = imageToContentX(rulerXPercent);
        const newX = -(contentX - W / 2) * transform.scale;
        setXY(newX, newY);
      } else {
        setXY(transform.x, newY);
      }
    }, [rulerYPercent, rulerXPercent, imageToContentY, imageToContentX, transform.x, transform.scale, setXY]);

    const fitWidth = useCallback(() => {
      const W = sizeRef.current?.clientWidth || 1;
      const imgW = contentItemRef.current?.offsetWidth || W;
      const targetScale = Math.min(5, Math.max(0.5, W / imgW));
      setFullTransform({ scale: targetScale, x: 0, y: 0 });
    }, [setFullTransform]);

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
      fitWidthTop() {
        const W = sizeRef.current?.clientWidth || 1;
        const H = sizeRef.current?.clientHeight || 1;
        const { w: imgW, h: imgH } = getStableContentDims();
        const targetScale = Math.min(5, Math.max(0.5, W / (imgW || W)));
        const maxTy = Math.max(0, ((imgH || H) * targetScale - H) / 2);
        setFullTransform({ scale: targetScale, x: 0, y: maxTy });
      },
      restoreTransform(scale: number, x: number, y: number) {
        setFullTransform({ scale, x, y });
      },
    }), [transform, setXY, imageToContentY, goToRuler, setFullTransform, getStableContentDims]);

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
        const { w: iW, h: iH } = getStableContentDims();
        const imgSize = axis === 'v' ? (iH || containerSize) : (iW || containerSize);
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

    // Compute scrollbar thumb positions based on stable content size
    const H = sizeRef.current?.clientHeight || 1;
    const W = sizeRef.current?.clientWidth || 1;
    const s = transform.scale;
    const { w: cImgW_raw, h: cImgH_raw } = getStableContentDims();
    const cImgH = cImgH_raw || H;
    const cImgW = cImgW_raw || W;

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
                    onLoadSuccess={async (pdfDoc: any) => {
                      const numPages: number = pdfDoc.numPages;
                      setPdfPages(numPages);
                      setVisibleRange({ start: 0, end: Math.min(2, numPages - 1) });

                      // ── 1순위 개선: PDF 메타데이터에서 모든 페이지 종횡비를 미리 파싱 ──
                      // 이를 통해 렌더링 전부터 정확한 전체 높이를 알 수 있어,
                      // 세로/가로 혼합 PDF에서도 진행선이 튀지 않음.
                      try {
                        const ratios: number[] = [];
                        for (let i = 1; i <= numPages; i++) {
                          const page = await pdfDoc.getPage(i);
                          const vp = page.getViewport({ scale: 1 });
                          ratios[i - 1] = vp.height / vp.width;
                        }
                        pageAspectRatiosRef.current = ratios;

                        // page-0 기준으로 pdfFirstPageHeightRef와 aspect ratio 초기화
                        const currentPw = containerWidthRef.current * 0.9 || 540;
                        if (ratios[0] > 0 && pdfFirstPageHeightRef.current === 0) {
                          pdfFirstPageHeightRef.current = ratios[0] * currentPw;
                          setPdfPageAspectRatio(ratios[0]);
                        }
                        // 파싱 완료 표시 후 setPreParseDone(true) → React 재렌더링 후
                        // preParseDone effect가 reportImageSize()를 호출한다.
                        // (직접 reportImageSize() 호출하면 setPdfPages가 아직 커밋 안 돼서
                        //  getStableContentDims()가 구버전 pdfPages를 사용하는 버그 발생)
                        preParseDoneRef.current = true;
                        setPreParseDone(true);
                      } catch {
                        // 파싱 실패: preParseDone 상태를 true로 설정해
                        // onRenderSuccess 또는 preParseDone effect가 reportImageSize를 호출하도록 허용
                        preParseDoneRef.current = true;
                        setPreParseDone(true);
                      }
                    }}
                    options={pdfOptions}
                    className="flex flex-col items-center gap-2"
                  >
                    {Array.from({ length: pdfPages }, (_, i) => {
                      const currentPw = containerWidth * 0.9;
                      // 페이지별 정확한 높이 사용 (혼합 크기 PDF 대응)
                      const ph = getPageCssHeight(i, currentPw);
                      const isVisible = i >= visibleRange.start && i <= visibleRange.end;
                      if (!isVisible) {
                        return <div key={i + 1} style={{ width: currentPw, height: ph, flexShrink: 0 }} />;
                      }
                      return (
                        <PdfPage
                          key={i + 1}
                          pageNumber={i + 1}
                          width={currentPw}
                          devicePixelRatio={effectivePdfDpr}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onRenderSuccess={() => {
                            // DOM 실측값으로 pageHeightsRef 갱신 (메타데이터보다 더 정확)
                            // offsetHeight은 transform-independent라 scale 오염 없음.
                            const pageEl = document.querySelector(
                              `.react-pdf__Page[data-page-number="${i + 1}"]`
                            ) as HTMLElement | null;
                            if (pageEl) {
                              const measuredH = pageEl.offsetHeight || pageEl.getBoundingClientRect().height;
                              if (measuredH > 0) {
                                pageHeightsRef.current[i] = measuredH;
                                if (i === 0 && pdfFirstPageHeightRef.current === 0) {
                                  pdfFirstPageHeightRef.current = measuredH;
                                  setPdfPageAspectRatio(measuredH / currentPw);
                                }
                              }
                            }
                            // 사전 파싱이 완료된 후에만 reportImageSize를 호출한다.
                            // 파싱 전에 호출하면 부정확한 imgH로 goToRuler()가 실행되고,
                            // 이후 imgH가 바뀔 때 진행선이 튀는 문제가 발생한다.
                            // (파싱 실패 시 preParseDoneRef는 catch 블록에서 true로 설정됨)
                            if (preParseDoneRef.current) {
                              reportImageSize();
                            }
                          }}
                        />
                      );
                    })}
                  </PdfDocument>
                </div>
              </Suspense>
            )}

            {contentOverlay}
          </div>
        </div>

        {/* Fixed overlays (ruler) */}
        {children}

        {/* Zoom level indicator — top-right, subtle */}
        <div className="absolute top-2 right-2 z-20 pointer-events-none select-none">
          <span className="text-[10px] font-mono text-[#3d2b1f]/30 tabular-nums">
            {Math.round(transform.scale * 100)}%
          </span>
        </div>

        {/* Vertical scrollbar — stops above zoom buttons (bottom ~160px) */}
        {showScrollbars && (
          <div ref={vTrackRef} className="absolute right-1 top-2 bottom-40 w-6 z-25">
            <div className="relative w-full h-full">
              <div
                className="absolute right-0 w-3 rounded-full bg-[#3d2b1f]/20"
                style={{ top: 0, bottom: 0 }}
              />
              <div
                className="absolute right-0 w-3 rounded-full bg-[#3d2b1f]/50 hover:bg-[#b5541e]/70 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
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
          <div ref={hTrackRef} className="absolute bottom-1 left-20 right-20 h-6 z-25">
            <div className="relative w-full h-full">
              <div
                className="absolute bottom-0 h-3 rounded-full bg-[#3d2b1f]/20"
                style={{ left: 0, right: 0 }}
              />
              <div
                className="absolute bottom-0 h-3 rounded-full bg-[#3d2b1f]/50 hover:bg-[#b5541e]/70 cursor-grab active:cursor-grabbing pointer-events-auto transition-colors"
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
            className="h-11 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-t-xl border-2 border-[#b07840] flex items-center justify-center text-[#7a5c46] text-xl font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label={t('viewer.zoomIn')}
          >
            +
          </button>
          <button
            onClick={zoomOut}
            className="h-11 bg-[#fdf6e8]/90 backdrop-blur-sm border-2 border-t-0 border-[#b07840] flex items-center justify-center text-[#7a5c46] text-xl font-bold hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label={t('viewer.zoomOut')}
          >
            −
          </button>
          <button
            onClick={fitWidth}
            className="h-11 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-b-xl border-2 border-t-0 border-[#b07840] flex flex-col items-center justify-center gap-0.5 text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label={t('viewer.fitWidth')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M4 12l3-3m-3 3l3 3M20 12l-3-3m3 3l-3 3" />
            </svg>
            <span className="text-[8px] font-bold leading-none">{t('viewer.fitWidth')}</span>
          </button>
        </div>

        {/* Ruler navigation — bottom-left */}
        <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 flex flex-col items-stretch gap-1.5 z-20 w-16">
          <button
            onClick={goToRuler}
            className="h-12 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-xl border-2 border-[#b07840] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
            aria-label={t('viewer.goToRuler')}
          >
            <span className="text-[10px] font-bold leading-snug text-center whitespace-pre-line">{t('viewer.goToRuler')}</span>
          </button>

          {onResetRuler && (
            <button
              onClick={onResetRuler}
              className="h-12 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-xl border-2 border-[#b07840] flex items-center justify-center text-[#7a5c46] hover:border-[#b5541e] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors"
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
