import { useState, useEffect, useLayoutEffect, useRef, useImperativeHandle, forwardRef, useMemo, lazy, Suspense, useCallback } from 'react';
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
  fitWidthGoToRuler: () => void;
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
  highlightBringRuler?: boolean;
  contentOverlay?: React.ReactNode;
  children?: React.ReactNode;
}

/** Gap between PDF pages, proportional to page width.
 *  This makes rulerY% device-independent: same % always refers to the same
 *  PDF content row regardless of screen size.
 *  Reference: 8px at pw=691 (= 768px container × 90%) */
const getPdfGap = (currentPw: number) => Math.max(1, Math.round(8 * currentPw / 691));

const PatternViewer = forwardRef<PatternViewerHandle, PatternViewerProps>(
  function PatternViewer({ fileUrl, fileType, rulerYPercent = 50, rulerXPercent, onTransformChange, onImageSize, onResetRuler, highlightBringRuler = false, contentOverlay, children }, ref) {
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

    // PDF render DPR: scale up quality proportionally with zoom level.
    //
    // For pixel-perfect quality at zoom S:
    //   ideal dpr = S × baseDpr  (1 canvas px per physical screen px)
    //
    // Canvas size limits:
    //   iOS Safari silently downsamples canvases that exceed ~16MP (4096²).
    //   Exceeding this limit makes quality WORSE, not better — so we cap DPR
    //   based on canvas area: maxWidth = sqrt(16MP / aspectRatio).
    //   Desktop browsers have no practical canvas size limit (~32000px).
    const baseDpr = window.devicePixelRatio || 1;
    const pw = containerWidth * 0.9;
    // Target canvas width ≈ 2000px at scale=1 (intentionally below maxDpr),
    // leaving headroom so DPR can visibly step up as the user zooms in.
    // e.g. iPhone 15 (pw=354): basePdfDpr=6 at scale=1 → steps to 9 at scale≈2.3×.
    // Setting this too high (e.g. 3000→basePdfDpr=maxDpr=9) eliminates the step effect.
    const basePdfDpr = containerWidth > 0 ? Math.max(baseDpr, Math.ceil(2000 / pw)) : baseDpr;
    // true for iOS Safari (iPhone / iPad); Android/desktop are unconstrained.
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    // PDF page dimensions — declared here so DPR effect can reference pdfPageAspectRatio.
    // pdfPageAspectRatio: page-0 h/w ratio (for iOS canvas area cap and memory budget calc)
    const [pdfPageAspectRatio, setPdfPageAspectRatio] = useState(1.414); // A4 default

    const [pdfRenderDpr, setPdfRenderDpr] = useState(0);
    const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (fileType !== 'pdf' || pw <= 0) return;
      // idealDpr: the minimum DPR needed for pixel-perfect rendering at zoom S.
      // At scale S, the page occupies pw*S CSS px = pw*S*baseDpr physical px on screen.
      // Since the canvas width = pw*dpr, we need dpr >= S*baseDpr.
      //
      // basePdfDpr is already set >> baseDpr (e.g. 7 on mobile with baseDpr=3),
      // so the canvas is over-sampled at scale=1 and quality stays fine up to
      // scale = basePdfDpr/baseDpr (≈2.3×) without any DPR change.
      // Beyond that threshold, idealDpr exceeds basePdfDpr and targetDpr increases.
      //
      // Using basePdfDpr as the multiplier instead of baseDpr would make DPR increase
      // far too aggressively on Android (272MB/page at 3× zoom), so we keep baseDpr.
      // iOS: area cap keeps canvas under ~16MP so Safari won't downsample it.
      // Desktop/Android: use generous 8000px width cap (memory ~ 200MB/page).
      const maxDpr = isIOS
        ? Math.max(1, Math.floor(Math.sqrt(16 * 1024 * 1024 / Math.max(pdfPageAspectRatio, 0.1)) / pw))
        : Math.max(1, Math.floor(8000 / pw));
      // At scale ≥ 5 (500%), snap to maxDpr for maximum quality (super-sampling beyond pixel-perfect).
      // Memory impact: BUFFER drops to 0 at high DPR, so only 1 page stays in memory.
      // iOS: already at maxDpr=9 from scale≈2.3×, so no change here.
      // Android (pw=354): pixel-perfect DPR=15 → maxDpr=22 at 500% (canvas 7788px, ~343MB/page).
      const idealDpr = transform.scale >= 5
        ? maxDpr
        : Math.ceil(transform.scale * baseDpr);
      // Correct formula: min(max(base, ideal), max) — always stays ≤ maxDpr.
      // Old formula max(base, min(ideal, max)) could exceed maxDpr when basePdfDpr > maxDpr
      // (e.g. tall/narrow PDF pages where measured aspectRatio raises maxDpr above default A4).
      const targetDpr = Math.min(Math.max(basePdfDpr, idealDpr), maxDpr);
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
      renderTimerRef.current = setTimeout(() => setPdfRenderDpr(targetDpr), 500);
      return () => { if (renderTimerRef.current) clearTimeout(renderTimerRef.current); };
    }, [transform.scale, pw, baseDpr, basePdfDpr, pdfPageAspectRatio, isIOS, fileType]);
    const effectivePdfDpr = pdfRenderDpr || basePdfDpr;

    // PDF page dimensions (pdfPageAspectRatio declared above near DPR code)
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

    // iOS high-quality overlay: renders only the visible portion of the page using
    // PDF.js directly, bypassing the 16MP canvas limit that prevents DPR > 9.
    // At scale ≥ 4, the canvas is used at device-native quality for the visible area.
    const pdfDocRef = useRef<any>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRenderTaskRef = useRef<any>(null);
    const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Reset all page measurements when the PDF file changes.
    useEffect(() => {
      pdfFirstPageHeightRef.current = 0;
      pageAspectRatiosRef.current = [];
      pageHeightsRef.current = [];
      preParseDoneRef.current = false;
      setPreParseDone(false);
      pdfDocRef.current = null;
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
        // Read container width directly from the DOM rather than containerWidthRef.
        // containerWidthRef is updated via a React effect (one render cycle after the
        // ResizeObserver fires), so for cached PDFs that parse before the first render
        // the ref would still hold the initial value (600), giving a wrong imgH and
        // mispositioned ruler on the first goToRuler() call.
        const currentPw = w || (sizeRef.current?.clientWidth ?? 0) * 0.9 || 540;
        const gap = getPdfGap(currentPw);
        let total = 0;
        for (let i = 0; i < pdfPages; i++) {
          total += getPageCssHeight(i, currentPw);
        }
        if (total > 0) h = total + gap * Math.max(0, pdfPages - 1);
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

    // useLayoutEffect fires synchronously after DOM mutations but before the browser
    // paints. This ensures the ruler (rendered in PatternView from viewTransform) is
    // always updated in the same frame as the CSS transform on the content div,
    // eliminating the one-frame lag that caused visible misalignment during zoom/pan.
    useLayoutEffect(() => {
      const H = sizeRef.current?.clientHeight || 1;
      const W = sizeRef.current?.clientWidth || 1;

      // Pan bounds clamping — only when user is NOT actively interacting.
      if (!isPanning) {
        const { w: imgW, h: imgH } = getStableContentDims();
        if (imgW > 0 && imgH > 0) {
          const { scale, x, y } = transform;
          const maxTy = Math.max(0, (imgH * scale - H) / 2);
          const maxTx = Math.max(0, (imgW * scale - W) / 2);
          const cx = Math.max(-maxTx, Math.min(maxTx, x));
          const cy = Math.max(-maxTy, Math.min(maxTy, y));
          if (cx !== x || cy !== y) {
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
      const gap = getPdfGap(currentPw);
      const offsets: number[] = [];
      const heights: number[] = [];
      let totalH = 0;
      for (let i = 0; i < pdfPages; i++) {
        offsets[i] = totalH;
        const ph = getPageCssHeight(i, currentPw);
        heights[i] = ph;
        totalH += ph + (i < pdfPages - 1 ? gap : 0);
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
        // If containerWidth changed significantly, clear stale DOM-measured heights.
        // getPageCssHeight() prefers pageHeightsRef (DOM measurements from old width)
        // over pageAspectRatiosRef (always proportional/correct). Clearing forces it
        // to use aspect ratios until pages re-render at the new width.
        if (Math.abs(width - containerWidthRef.current) > 5) {
          pageHeightsRef.current = [];
        }
        setContainerWidth(width);
        onTransformChangeRef.current?.(transformRef.current, height, width);
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

    // iOS high-quality overlay effect.
    // At scale >= 4, renders only the currently visible portion of the page using
    // PDF.js directly at device-native DPR, achieving pixel-perfect quality that
    // is otherwise blocked by iOS Safari's 16MP canvas area limit.
    useEffect(() => {
      const canvas = overlayCanvasRef.current;

      // Helper: restore all react-pdf page canvases to visible.
      const showPdfCanvases = () => {
        document.querySelectorAll<HTMLElement>('.react-pdf__Page canvas').forEach((el) => {
          el.style.visibility = '';
        });
      };

      // Always cancel any in-flight render and hide the stale overlay immediately
      // so it never lingers at the wrong position while the user is panning/zooming.
      // Also restore PDF canvases so the pattern is always visible while the overlay
      // is not yet drawn.
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (overlayRenderTaskRef.current) {
        try { overlayRenderTaskRef.current.cancel(); } catch (_) {}
        overlayRenderTaskRef.current = null;
      }
      if (canvas) canvas.style.display = 'none';
      showPdfCanvases();

      if (!isIOS || fileType !== 'pdf' || transform.scale < 4 || !pdfDocRef.current || !canvas) {
        return;
      }

      overlayTimerRef.current = setTimeout(async () => {
        if (!pdfDocRef.current || !canvas || !sizeRef.current) return;
        const W = sizeRef.current.clientWidth;
        const H = sizeRef.current.clientHeight;
        const S = transform.scale;
        const tx = transform.x;
        const ty = transform.y;
        const pw = containerWidthRef.current * 0.9;
        const dpr = window.devicePixelRatio || 1;

        // Compute total content height and page y-offsets (same as visibleRange logic).
        const gap = Math.max(1, Math.round(8 * pw / 691));
        const pageOffsets: number[] = [];
        let totalH = 0;
        for (let i = 0; i < pdfPages; i++) {
          pageOffsets[i] = totalH;
          totalH += getPageCssHeight(i, pw) + (i < pdfPages - 1 ? gap : 0);
        }

        // Find the page that covers the most screen area.
        let bestPage = -1;
        let bestVisArea = 0;
        for (let i = 0; i < pdfPages; i++) {
          const ph = getPageCssHeight(i, pw);
          // Page top-left in screen coords (content origin = screen center + translate):
          const screenLeft = W / 2 + tx - pw / 2 * S;
          const screenTop  = H / 2 + ty + (-totalH / 2 + pageOffsets[i]) * S;
          const visLeft   = Math.max(0, screenLeft);
          const visRight  = Math.min(W, screenLeft + pw * S);
          const visTop    = Math.max(0, screenTop);
          const visBottom = Math.min(H, screenTop + ph * S);
          const area = Math.max(0, visRight - visLeft) * Math.max(0, visBottom - visTop);
          if (area > bestVisArea) { bestVisArea = area; bestPage = i; }
        }
        if (bestPage < 0 || bestVisArea < 1) { return; }

        const pageIdx = bestPage;
        const ph = getPageCssHeight(pageIdx, pw);
        const screenLeft = W / 2 + tx - pw / 2 * S;
        const screenTop  = H / 2 + ty + (-totalH / 2 + pageOffsets[pageIdx]) * S;
        const visLeft   = Math.max(0, screenLeft);
        const visRight  = Math.min(W, screenLeft + pw * S);
        const visTop    = Math.max(0, screenTop);
        const visBottom = Math.min(H, screenTop + ph * S);
        const visW = visRight - visLeft;
        const visH = visBottom - visTop;
        if (visW < 1 || visH < 1) { return; }

        // Visible region in page CSS coordinates (scale=1):
        const visPageLeft  = (visLeft  - screenLeft) / S;
        const visPageTop   = (visTop   - screenTop)  / S;
        const visPageWidth = visW / S;

        // Prepare canvas dimensions (still display:none — shown only after render succeeds).
        const canvasW = Math.round(visW * dpr);
        const canvasH = Math.round(visH * dpr);
        canvas.width  = canvasW;
        canvas.height = canvasH;

        // PDF.js render scale: maps visible page CSS width → canvas pixel width.
        let pdfPage: any;
        try { pdfPage = await pdfDocRef.current.getPage(pageIdx + 1); } catch (_) { return; }
        const naturalViewport = pdfPage.getViewport({ scale: 1 });
        const renderScale = canvasW * pw / (visPageWidth * naturalViewport.width);

        // Offset so the visible region starts at canvas origin.
        const offsetX = -(visPageLeft * naturalViewport.width / pw) * renderScale;
        const offsetY = -(visPageTop  * naturalViewport.width / pw) * renderScale;

        const viewport = pdfPage.getViewport({ scale: renderScale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.save();
        ctx.translate(offsetX, offsetY);

        if (overlayRenderTaskRef.current) {
          try { overlayRenderTaskRef.current.cancel(); } catch (_) {}
        }
        overlayRenderTaskRef.current = pdfPage.render({ canvasContext: ctx, viewport });
        try {
          await overlayRenderTaskRef.current.promise;
        } catch (e: any) {
          if (e?.name !== 'RenderingCancelledException') console.warn('overlay render error', e);
          ctx.restore();
          // Render failed — keep PDF canvas visible (showPdfCanvases already called above).
          return;
        }
        ctx.restore();

        // Render succeeded: show overlay and hide the underlying PDF canvas so they
        // don't overlap. PDF canvases are restored the next time the overlay hides.
        canvas.style.cssText = `position:absolute;left:${visLeft}px;top:${visTop}px;width:${visW}px;height:${visH}px;display:block;pointer-events:none;z-index:8;`;
        const pdfPageCanvas = document.querySelector<HTMLElement>(
          `.react-pdf__Page[data-page-number="${pageIdx + 1}"] canvas`
        );
        if (pdfPageCanvas) pdfPageCanvas.style.visibility = 'hidden';
      }, 350);

      return () => {
        if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      };
    }, [transform, fileType, pdfPages, containerWidth, isIOS, getPageCssHeight]);

    // Cleanup overlay on unmount — restore PDF canvases so they're never stuck hidden.
    useEffect(() => () => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      if (overlayRenderTaskRef.current) {
        try { overlayRenderTaskRef.current.cancel(); } catch (_) {}
      }
      document.querySelectorAll<HTMLElement>('.react-pdf__Page canvas').forEach((el) => {
        el.style.visibility = '';
      });
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
      const { h: imgH } = getStableContentDims();

      // If current scale can't scroll ruler to center (image smaller than container),
      // compute minimum scale needed so ruler can be centered.
      let targetScale = transform.scale;
      const needed_ty = -(contentY - H / 2) * targetScale;
      const maxTy = Math.max(0, (imgH * targetScale - H) / 2);
      if (imgH > 0 && Math.abs(needed_ty) > maxTy + 0.5) {
        const distY = Math.abs(contentY - H / 2);
        const denom = imgH - 2 * distY;
        targetScale = Math.min(10, Math.max(targetScale, denom > 0 ? H / denom : 1.5));
      }

      const newY = -(contentY - H / 2) * targetScale;
      if (rulerXPercent !== undefined) {
        const contentX = imageToContentX(rulerXPercent);
        const newX = -(contentX - W / 2) * targetScale;
        setFullTransform({ scale: targetScale, x: newX, y: newY });
      } else if (targetScale !== transform.scale) {
        setFullTransform({ scale: targetScale, x: transform.x, y: newY });
      } else {
        setXY(transform.x, newY);
      }
    }, [rulerYPercent, rulerXPercent, imageToContentY, imageToContentX, getStableContentDims, transform.x, transform.scale, setXY, setFullTransform]);

    const fitWidth = useCallback(() => {
      const W = sizeRef.current?.clientWidth || 1;
      const H = sizeRef.current?.clientHeight || 1;
      const imgW = contentItemRef.current?.offsetWidth || W;
      const { h: imgH } = getStableContentDims();
      const s = transform.scale;
      const targetScale = Math.min(10, Math.max(0.5, W / imgW));
      // Keep the same content point at the screen center — only scale changes.
      // With transform-origin:center, content-center-Y = H/2 - ty/scale.
      // Setting new ty so that content-center-Y is unchanged:
      //   new_ty = transform.y * (targetScale / s)
      const newTy = s > 0 ? transform.y * (targetScale / s) : 0;
      const maxTy = Math.max(0, (imgH * targetScale - H) / 2);
      setFullTransform({ scale: targetScale, x: 0, y: Math.max(-maxTy, Math.min(maxTy, newTy)) });
    }, [transform, getStableContentDims, setFullTransform]);

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
      fitWidthGoToRuler() {
        const W = sizeRef.current?.clientWidth || 1;
        const H = sizeRef.current?.clientHeight || 1;
        const { w: imgW, h: imgH } = getStableContentDims();
        const targetScale = Math.min(10, Math.max(0.5, W / (imgW || W)));
        const contentY = imageToContentY(rulerYPercent);
        const newY = -(contentY - H / 2) * targetScale;
        const maxTy = Math.max(0, (imgH * targetScale - H) / 2);
        if (rulerXPercent !== undefined) {
          const contentX = imageToContentX(rulerXPercent);
          const newX = -(contentX - W / 2) * targetScale;
          setFullTransform({ scale: targetScale, x: Math.max(-maxTy, Math.min(maxTy, newX)), y: Math.max(-maxTy, Math.min(maxTy, newY)) });
        } else {
          setFullTransform({ scale: targetScale, x: 0, y: Math.max(-maxTy, Math.min(maxTy, newY)) });
        }
      },
      fitWidthTop() {
        const W = sizeRef.current?.clientWidth || 1;
        const H = sizeRef.current?.clientHeight || 1;
        const { w: imgW, h: imgH } = getStableContentDims();
        const targetScale = Math.min(10, Math.max(0.5, W / (imgW || W)));
        const maxTy = Math.max(0, ((imgH || H) * targetScale - H) / 2);
        setFullTransform({ scale: targetScale, x: 0, y: maxTy });
      },
      restoreTransform(scale: number, x: number, y: number) {
        setFullTransform({ scale, x, y });
      },
    }), [transform, setXY, imageToContentY, imageToContentX, goToRuler, setFullTransform, getStableContentDims, rulerYPercent, rulerXPercent]);

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
                <div ref={(el) => { contentItemRef.current = el; }} className="flex flex-col items-center">
                  <PdfDocument
                    file={fileUrl}
                    onLoadSuccess={async (pdfDoc: any) => {
                      pdfDocRef.current = pdfDoc;
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
                    className="flex flex-col items-center"
                  >
                    {Array.from({ length: pdfPages }, (_, i) => {
                      const currentPw = containerWidth * 0.9;
                      // 페이지별 정확한 높이 사용 (혼합 크기 PDF 대응)
                      const ph = getPageCssHeight(i, currentPw);
                      const isVisible = i >= visibleRange.start && i <= visibleRange.end;
                      // Gap is applied as marginBottom on each item (not flex gap) so that
                      // the proportional gap value matches what getStableContentDims() calculates.
                      const pageGap = i < pdfPages - 1 ? getPdfGap(currentPw) : 0;
                      if (!isVisible) {
                        return <div key={i + 1} style={{ width: currentPw, height: ph, flexShrink: 0, marginBottom: pageGap }} />;
                      }
                      return (
                        // Include effectivePdfDpr in key so that when DPR changes,
                        // PdfPage is remounted and the canvas re-renders at the new
                        // resolution. Without this, react-pdf may not re-render the
                        // canvas canvas when only devicePixelRatio prop changes.
                        <div key={`${i + 1}-${effectivePdfDpr}`} style={{ marginBottom: pageGap }}>
                          <PdfPage
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
                        </div>
                      );
                    })}
                  </PdfDocument>
                </div>
              </Suspense>
            )}

            {contentOverlay}
          </div>
        </div>

        {/* iOS high-quality overlay canvas — rendered via PDF.js directly */}
        <canvas ref={overlayCanvasRef} style={{ display: 'none' }} />

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
        <div className={`absolute bottom-2 sm:bottom-4 left-2 sm:left-4 flex flex-col items-stretch gap-1.5 ${highlightBringRuler ? 'z-50' : 'z-20'} w-16`}>
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
              className={`h-12 bg-[#fdf6e8]/90 backdrop-blur-sm rounded-xl border-2 flex items-center justify-center text-[#7a5c46] hover:text-[#b5541e] active:bg-[#f5edd6] transition-colors ${
                highlightBringRuler
                  ? 'border-[#b5541e] animate-pulse shadow-[0_0_0_3px_rgba(181,84,30,0.3)]'
                  : 'border-[#b07840] hover:border-[#b5541e]'
              }`}
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
