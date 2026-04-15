import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import YarnLoader from '@/components/YarnLoader';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress, CompletedMark, RulerDirection, RulerOrientation, NotePosition, SubPattern, CrochetMark, KnittingMark, ImagePerState } from '@/lib/types';
import PatternViewer, { type PatternViewerHandle } from '@/components/PatternViewer';
import RowRuler from '@/components/RowRuler';
import CrochetRuler from '@/components/CrochetRuler';
import CompletedOverlay from '@/components/CompletedOverlay';
import CrochetMarkers from '@/components/CrochetMarkers';
import KnittingMarkers from '@/components/KnittingMarkers';
import NoteBubbles from '@/components/NoteBubbles';
import SubPatternSelector from '@/components/SubPatternSelector';
import RowCounter from '@/components/RowCounter';
import PatternNotes from '@/components/PatternNotes';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { enqueueOfflineUpdate, cachePattern, getCachedPattern } from '@/lib/offlineQueue';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultSubPattern(index: number, prefix: string): SubPattern {
  return {
    id: generateId(),
    name: `${prefix} ${index}`,
    total_rows: 1,
    current_row: 0,
  };
}

export default function PatternView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState<PatternWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('patterns')
        .select(`*, progress:pattern_progress(*)`)
        .eq('id', id!)
        .single(),
    ]).then(([authResult, queryResult]) => {
      if (!authResult.data.session?.user) {
        navigate('/login');
        return;
      }

      if (queryResult.error || !queryResult.data) {
        // Offline fallback: try localStorage cache
        if (!navigator.onLine && id) {
          const cached = getCachedPattern(id);
          if (cached) {
            setPattern(cached);
            setIsFromCache(true);
            setLoading(false);
            return;
          }
        }
        navigate('/dashboard');
        return;
      }

      const loaded: PatternWithProgress = {
        ...queryResult.data,
        progress: queryResult.data.progress?.[0] || null,
      } as PatternWithProgress;
      cachePattern(loaded); // persist for offline use
      setPattern(loaded);
      setLoading(false);
    }).catch(() => {
      // Network error: try cache before giving up
      if (!navigator.onLine && id) {
        const cached = getCachedPattern(id);
        if (cached) {
          setPattern(cached);
          setIsFromCache(true);
          setLoading(false);
          return;
        }
      }
      navigate('/dashboard');
    });
  }, [id, navigate]);

  if (loading || !pattern) {
    return (
      <div className="min-h-screen flex flex-col bg-[#faf9f7]">
        <div className="px-4 py-3">
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <YarnLoader />
        </div>
      </div>
    );
  }

  return <PatternViewerPage pattern={pattern} isFromCache={isFromCache} />;
}

interface Props {
  pattern: PatternWithProgress;
  isFromCache?: boolean;
}

type CrochetRing = { cx: number; cy: number; r: number; ry?: number; shape?: 'circle' | 'ellipse' | 'rect' };

type Snapshot = {
  subPatterns: SubPattern[];
  activeSubId: string;
  rulerY: number;
  rulerHeight: number;
  rulerDirection: RulerDirection;
  rulerOrientation: RulerOrientation;
  rulerX: number;
  completedMarks: CompletedMark[];
  crochetMarks: CrochetMark[];
  knittingMarks: KnittingMark[];
  crochetCx: number;
  crochetCy: number;
  crochetR: number;
  crochetRy: number;
  completedCrochetRings: CrochetRing[];
};

const MAX_HISTORY = 20;

function PatternViewerPage({ pattern, isFromCache }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const viewerRef = useRef<PatternViewerHandle>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  const isCrochet = pattern.type === 'crochet';

  // Per-image state storage. Persisted in DB as image_states JSONB array.
  // imageStatesRef.current[i] holds the saved state for image index i.
  const imageStatesRef = useRef<ImagePerState[]>(
    (pattern.progress?.image_states as ImagePerState[]) || []
  );
  // Convenience shortcut: state for image 0, used for initial useState values below.
  const img0 = imageStatesRef.current[0];

  const initSubPatterns = (): SubPattern[] => {
    const saved = pattern.progress?.sub_patterns as SubPattern[] | undefined;
    if (saved && saved.length > 0) {
      return saved.map((s) => ({
        ...s,
        total_rows: s.total_rows || pattern.total_rows || 1,
      }));
    }
    return [{
      id: generateId(),
      name: `${t('sub.defaultPrefix')} 1`,
      total_rows: pattern.total_rows || 1,
      current_row: pattern.progress?.current_row || 0,
    }];
  };

  const [subPatterns, setSubPatterns] = useState<SubPattern[]>(initSubPatterns);
  const [activeSubId, setActiveSubId] = useState<string>(
    (pattern.progress?.active_sub_pattern_id as string) || subPatterns[0]?.id || ''
  );

  const activeSub = subPatterns.find((s) => s.id === activeSubId) || subPatterns[0];

  // Ruler stored in CONTENT coordinates (% of pattern, not screen)
  const [rulerY, setRulerY] = useState(img0?.ruler_position_y ?? pattern.progress?.ruler_position_y ?? 50);
  const [rulerHeight, setRulerHeight] = useState(img0?.ruler_height ?? pattern.progress?.ruler_height ?? 0.3);
  const [maxRulerHeight, setMaxRulerHeight] = useState(() => Math.max(1.35, img0?.ruler_height ?? pattern.progress?.ruler_height ?? 0));
  const [showSubPatternGuide, setShowSubPatternGuide] = useState(false);
  const [showCrochetShapeGuide, setShowCrochetShapeGuide] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showRulerGuide, setShowRulerGuide] = useState(false);

  // Crochet ruler state — initialized from img0 (per-image) with top-level fallback
  const [crochetShape, setCrochetShape] = useState<'line' | 'circle' | 'ellipse' | 'rect'>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { shape?: string } | undefined;
    return (saved?.shape ?? 'circle') as 'line' | 'circle' | 'ellipse' | 'rect';
  });
  const [crochetCx, setCrochetCx] = useState<number>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { cx?: number } | undefined;
    return saved?.cx ?? 50;
  });
  const [crochetCy, setCrochetCy] = useState<number>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { cy?: number } | undefined;
    return saved?.cy ?? 50;
  });
  const [crochetR, setCrochetR] = useState<number>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { r?: number } | undefined;
    return saved?.r ?? 3;
  });
  const [crochetRy, setCrochetRy] = useState<number>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { ry?: number; r?: number } | undefined;
    return saved?.ry ?? saved?.r ?? 3;
  });
  const [completedCrochetRings, setCompletedCrochetRings] = useState<CrochetRing[]>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { cx?: number; cy?: number; completedRings?: (number | CrochetRing)[] } | undefined;
    const savedCx = saved?.cx ?? 50;
    const savedCy = saved?.cy ?? 50;
    return (saved?.completedRings ?? []).map(r => typeof r === 'number' ? { cx: savedCx, cy: savedCy, r } : r);
  });
  const [rulerDirection, setRulerDirection] = useState<RulerDirection>(
    img0?.ruler_direction ?? (pattern.progress?.ruler_direction as RulerDirection) ?? 'up'
  );
  const [rulerOrientation, setRulerOrientation] = useState<RulerOrientation>(
    img0?.ruler_orientation ?? (pattern.progress?.ruler_orientation as RulerOrientation) ?? 'vertical'
  );
  const [rulerX, setRulerX] = useState<number>(
    img0?.ruler_position_x ?? (pattern.progress?.ruler_position_x as number) ?? 50
  );
  const [completedMarks, setCompletedMarks] = useState<CompletedMark[]>(
    img0?.completed_marks ?? (pattern.progress?.completed_marks as CompletedMark[]) ?? []
  );
  const [hasMarkSelection, setHasMarkSelection] = useState(false);
  const [isAdjustingRuler, setIsAdjustingRuler] = useState(false);

  // Multiple images: primary + extra
  const allFiles = useMemo(() => {
    const extras = (pattern.extra_image_urls ?? []).map((f) => ({
      url: f.url,
      file_type: (f.file_type ?? (f.url.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image')) as 'image' | 'pdf',
    }));
    return [{ url: pattern.file_url, file_type: pattern.file_type }, ...extras];
  }, [pattern.file_url, pattern.file_type, pattern.extra_image_urls]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  // Keep a mutable ref so stable callbacks (handleImageSize) can read current index
  const activeFileIdxRef = useRef(0);
  activeFileIdxRef.current = activeFileIdx;
  const [isImageLoading, setIsImageLoading] = useState(false);
  // Tracks previous image index so we can save its state before switching
  const prevFileIdxRef = useRef(0);
  // Set of image indices that have been visited (and thus have saved per-image state)
  const [visitedImageIndices, setVisitedImageIndices] = useState<Set<number>>(() => {
    const visited = new Set<number>([0]); // image 0 always considered visited
    imageStatesRef.current.forEach((s, i) => { if (s) visited.add(i); });
    return visited;
  });
  const [showRulerSettings, setShowRulerSettings] = useState(false);
  const [showCrochetSettings, setShowCrochetSettings] = useState(false);
  const [isAdjustingCrochetRadius, setIsAdjustingCrochetRadius] = useState(false);

  // Current viewer transform — updated every frame during pan/zoom
  const [viewTransform, setViewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [containerH, setContainerH] = useState(600);
  const [containerW, setContainerW] = useState(600);
  // Rendered image size in CSS px (at scale=1). 0 = not yet measured.
  const [imgH, setImgH] = useState(0);
  const [imgW, setImgW] = useState(0);

  // Restore view once: after image is loaded
  const initialScrollDoneRef = useRef(false);
  // Track last reported image height so we can detect significant imgH changes
  const lastReportedImgH = useRef(0);
  // Debounce timer for goToRuler correction after significant imgH changes
  const goToRulerCorrectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety timeout ref: clears isImageLoading if image never fires onImageSize (e.g., load error)
  const imageLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 첫 오픈 판정: 코바늘 원형/타원/사각은 crochet_ruler_data.r 유무로, 나머지는 ruler_height 유무로 판단
  // 가이드를 '다시 표시하지 않기' 설정한 경우에는 항상 false
  const isFirstOpenRef = useRef((() => {
    if (localStorage.getItem('kis_guide_dismissed') === 'true') return false;
    if (!pattern.progress) return true;
    const savedCrochetData = pattern.progress.crochet_ruler_data as { r?: number; shape?: string } | undefined;
    const isCrochetNonLine = pattern.type === 'crochet' && (savedCrochetData?.shape ?? 'circle') !== 'line';
    if (isCrochetNonLine) return !(savedCrochetData?.r);
    return !(pattern.progress.ruler_height as number | null | undefined);
  })());
  const showGuideRef = useRef(showCrochetShapeGuide || showGuide);
  useEffect(() => { showGuideRef.current = showCrochetShapeGuide || showGuide; }, [showCrochetShapeGuide, showGuide]);

  // Cleanup timers on unmount to prevent state updates on unmounted component
  useEffect(() => () => {
    if (goToRulerCorrectionTimerRef.current) clearTimeout(goToRulerCorrectionTimerRef.current);
    if (imageLoadingTimeoutRef.current) clearTimeout(imageLoadingTimeoutRef.current);
  }, []);

  const handleImageSize = useCallback((w: number, h: number) => {
    const prevH = lastReportedImgH.current;
    lastReportedImgH.current = h;
    // Immediately mutate latestRef so ruler calculations use fresh image dimensions
    latestRef.current.imgW = w;
    latestRef.current.imgH = h;
    setImgW(w);
    setImgH(h);
    if (!initialScrollDoneRef.current && h > 0) {
      initialScrollDoneRef.current = true;
      if (imageLoadingTimeoutRef.current) { clearTimeout(imageLoadingTimeoutRef.current); imageLoadingTimeoutRef.current = null; }
      setIsImageLoading(false);
      // Double RAF: ensures browser has fully laid out the image before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isFirstOpenRef.current || showGuideRef.current) {
            // 첫 방문 또는 가이드 중: 화면 맞춤 먼저, 그 다음 가이드 표시
            viewerRef.current?.fitWidthTop();
            if (isFirstOpenRef.current && activeFileIdxRef.current === 0) {
              setShowSubPatternGuide(true);
            }
          } else {
            // 재방문: fit-width 배율로 진행선 중앙 정렬 (scale=1 초기값에서 zoom-in하는 문제 방지)
            viewerRef.current?.fitWidthGoToRuler();
          }
        });
      });
    } else if (
      h > 0 &&
      Math.abs(h - prevH) > 50 &&
      !isFirstOpenRef.current &&
      !showGuideRef.current
    ) {
      // imgH changed significantly (>50px) — this indicates the container width changed
      // (device rotation, window resize) and imgH has been recalculated.
      // DOM rounding differences between pages (<50px total) are intentionally ignored.
      // Debounce 300ms to collapse rapid sequential ResizeObserver/render events.
      if (goToRulerCorrectionTimerRef.current) clearTimeout(goToRulerCorrectionTimerRef.current);
      goToRulerCorrectionTimerRef.current = setTimeout(() => {
        requestAnimationFrame(() => viewerRef.current?.fitWidthGoToRuler());
      }, 300);
    }
  }, []);

  // Ref for stable callbacks that need latest transform/ruler values.
  // Updated directly in render (not via useEffect) so it is always current
  // before any pointer event fires — even in the same frame as a state change.
  const latestRef = useRef({ rulerY, rulerHeight, maxRulerHeight, rulerX, rulerOrientation, rulerDirection, viewTransform, containerH, containerW, imgH, imgW, crochetR, crochetRy, crochetCx, crochetCy, crochetShape, completedCrochetRings });
  latestRef.current = { rulerY, rulerHeight, maxRulerHeight, rulerX, rulerOrientation, rulerDirection, viewTransform, containerH, containerW, imgH, imgW, crochetR, crochetRy, crochetCx, crochetCy, crochetShape, completedCrochetRings };

  const handleTransformChange = useCallback(
    (t: { scale: number; x: number; y: number }, H: number, W: number) => {
      // Immediately mutate latestRef so handleRulerPositionChange reads fresh values
      // even before React re-renders (eliminates stale-scale cross-device mismatch)
      latestRef.current.viewTransform = t;
      latestRef.current.containerH = H;
      latestRef.current.containerW = W;
      setViewTransform(t);
      setContainerH(H);
      setContainerW(W);
    },
    []
  );

  // Undo/Redo history
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoStateRef = useRef<Snapshot>({
    subPatterns,
    activeSubId,
    rulerY,
    rulerHeight,
    rulerDirection,
    rulerOrientation,
    rulerX,
    completedMarks,
    crochetMarks: [],
    knittingMarks: [],
    crochetCx,
    crochetCy,
    crochetR,
    crochetRy,
    completedCrochetRings,
  });

  const captureHistory = useCallback(() => {
    undoStackRef.current.push({ ...undoStateRef.current });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const applySnapshot = useCallback((snap: Snapshot) => {
    setSubPatterns(snap.subPatterns);
    setActiveSubId(snap.activeSubId);
    setRulerY(snap.rulerY);
    setRulerHeight(snap.rulerHeight);
    setRulerDirection(snap.rulerDirection);
    setRulerOrientation(snap.rulerOrientation);
    setRulerX(snap.rulerX);
    setCompletedMarks(snap.completedMarks);
    setCrochetMarks(snap.crochetMarks);
    setKnittingMarks(snap.knittingMarks);
    setCrochetCx(snap.crochetCx);
    setCrochetCy(snap.crochetCy);
    setCrochetR(snap.crochetR);
    setCrochetRy(snap.crochetRy);
    setCompletedCrochetRings(snap.completedCrochetRings);
  }, []);

  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop();
    if (!snap) return;
    redoStackRef.current.push({ ...undoStateRef.current });
    if (redoStackRef.current.length > MAX_HISTORY) redoStackRef.current.shift();
    applySnapshot(snap);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    const snap = redoStackRef.current.pop();
    if (!snap) return;
    undoStackRef.current.push({ ...undoStateRef.current });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    applySnapshot(snap);
    setCanUndo(true);
    setCanRedo(redoStackRef.current.length > 0);
  }, [applySnapshot]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // Convert image-relative % → screen % using current transform.
  // rulerY/rulerHeight are stored as % of the rendered IMAGE height,
  // making them device-independent regardless of container size or letterboxing.
  const contentToScreenY = (imagePct: number, t = viewTransform, H = containerH, iH = imgH) => {
    const imgTop = iH > 0 ? (H - iH) / 2 : 0;
    const refH = iH > 0 ? iH : H;
    const contentY = imgTop + (imagePct / 100) * refH;
    const screenY = (contentY - H / 2) * t.scale + H / 2 + t.y;
    return (screenY / H) * 100;
  };

  // X-axis equivalents (for crochet circle center)
  const contentToScreenX = (imagePct: number, t = viewTransform, W = containerW, iW = imgW) => {
    const imgLeft = iW > 0 ? (W - iW) / 2 : 0;
    const refW = iW > 0 ? iW : W;
    const contentX = imgLeft + (imagePct / 100) * refW;
    const screenX = (contentX - W / 2) * t.scale + W / 2 + t.x;
    return (screenX / W) * 100;
  };

  // Radius: proportional size (no translation offset)
  const contentToScreenR = (imagePct: number, t = viewTransform, W = containerW, iW = imgW) => {
    const refW = iW > 0 ? iW : W;
    return (imagePct / 100) * refW * t.scale / W * 100;
  };

  // Vertical radius (ry): uses containerH instead of containerW
  const contentToScreenRy = (imagePct: number, t = viewTransform, H = containerH, iH = imgH) => {
    const refH = iH > 0 ? iH : H;
    return (imagePct / 100) * refH * t.scale / H * 100;
  };

  // Convert screen % → image-relative %
  const screenToContentY = (screenPct: number, t = viewTransform, H = containerH, iH = imgH) => {
    const screenY = (screenPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    if (iH > 0) return ((contentY - (H - iH) / 2) / iH) * 100;
    return (contentY / H) * 100;
  };

  const screenToContentX = (screenPct: number, t = viewTransform, W = containerW, iW = imgW) => {
    const screenX = (screenPct / 100) * W;
    const contentX = (screenX - W / 2 - t.x) / t.scale + W / 2;
    if (iW > 0) return ((contentX - (W - iW) / 2) / iW) * 100;
    return (contentX / W) * 100;
  };

  const screenToContentR = (screenPct: number, t = viewTransform, W = containerW, iW = imgW) => {
    const refW = iW > 0 ? iW : W;
    return (screenPct / 100) * W / (refW * t.scale) * 100;
  };

  const screenToContentRy = (screenPct: number, t = viewTransform, H = containerH, iH = imgH) => {
    const refH = iH > 0 ? iH : H;
    return (screenPct / 100) * H / (refH * t.scale) * 100;
  };

  // Screen positions for RowRuler display (derived, not stored)
  const screenRulerY = contentToScreenY(rulerY);
  const screenRulerHeight = imgH > 0
    ? (rulerHeight / 100) * imgH * viewTransform.scale / containerH * 100
    : rulerHeight * viewTransform.scale;

  // Horizontal ruler screen position (X-axis equivalent)
  const screenRulerX = contentToScreenX(rulerX);
  const screenRulerWidth = imgW > 0
    ? (rulerHeight / 100) * imgW * viewTransform.scale / containerW * 100
    : rulerHeight * viewTransform.scale;

  // When RowRuler reports drag (screen coords) → convert to image-relative coords
  const handleRulerPositionChange = useCallback((screenYPct: number) => {
    const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
    const screenY = (screenYPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    setRulerY(iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100);
  }, []);

  const handleRulerPositionXChange = useCallback((screenXPct: number) => {
    const { viewTransform: t, containerW: W, imgW: iW } = latestRef.current;
    const screenX = (screenXPct / 100) * W;
    const contentX = (screenX - W / 2 - t.x) / t.scale + W / 2;
    setRulerX(iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100);
  }, []);

  const handleRotateRuler = useCallback(() => {
    captureHistory();
    // Clockwise 4-state cycle:
    //   UP   (vertical  + up)   → RIGHT (horizontal + down)
    //   RIGHT(horizontal+ down) → DOWN  (vertical   + down)
    //   DOWN (vertical  + down) → LEFT  (horizontal + up)
    //   LEFT (horizontal+ up)   → UP    (vertical   + up)
    const { rulerOrientation: o, rulerDirection: d, rulerHeight: rh, maxRulerHeight: mh, imgH: iH, imgW: iW } = latestRef.current;

    // Convert rulerHeight to preserve the same visual screen size after rotation.
    // vertical rulerHeight is % of imgH; horizontal rulerHeight is % of imgW.
    // screen_px = (h/100) * imgH * scale  (vertical)
    // screen_px = (h/100) * imgW * scale  (horizontal)
    // Preserving screen_px: newH = h * imgH/imgW  (vertical→horizontal)
    let newRulerHeight = rh;
    let newMaxRulerHeight = mh;
    if (iH > 0 && iW > 0) {
      const factor = o === 'vertical' ? iH / iW : iW / iH;
      newRulerHeight = Math.max(0.001, Math.min(100, rh * factor));
      newMaxRulerHeight = Math.max(newRulerHeight, Math.min(100, mh * factor));
    }
    setRulerHeight(newRulerHeight);
    setMaxRulerHeight(newMaxRulerHeight);

    if (o === 'vertical' && d === 'up') {
      setRulerOrientation('horizontal'); setRulerDirection('down');
    } else if (o === 'horizontal' && d === 'down') {
      setRulerOrientation('vertical'); // direction stays 'down'
    } else if (o === 'vertical' && d === 'down') {
      setRulerOrientation('horizontal'); setRulerDirection('up');
    } else {
      // horizontal + up → UP
      setRulerOrientation('vertical'); setRulerDirection('up');
    }
  }, [captureHistory]);

  const handleRulerHeightChange = useCallback((screenHPct: number) => {
    const { viewTransform: t, containerH: H, containerW: W, imgH: iH, imgW: iW, rulerOrientation: o } = latestRef.current;
    if (o === 'horizontal') {
      const contentW_px = (screenHPct / 100) * W / t.scale;
      const refW = iW > 0 ? iW : W;
      setRulerHeight(Math.max(0.001, (contentW_px / refW) * 100));
    } else {
      const contentH_px = (screenHPct / 100) * H / t.scale;
      const refH = iH > 0 ? iH : H;
      setRulerHeight(Math.min(maxRulerHeight, Math.max(0.001, (contentH_px / refH) * 100)));
    }
    setShowGuide(false);
  }, [maxRulerHeight]);

  const handleCrochetCenterChange = useCallback((screenCxPct: number, screenCyPct: number) => {
    const { viewTransform: t, containerW: W, containerH: H, imgW: iW, imgH: iH } = latestRef.current;
    const screenX = (screenCxPct / 100) * W;
    const contentX = (screenX - W / 2 - t.x) / t.scale + W / 2;
    const cx = iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
    const screenY = (screenCyPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    const cy = iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
    setCrochetCx(cx);
    setCrochetCy(cy);
  }, []);

  const handleCrochetRadiusChange = useCallback((screenRPct: number) => {
    const { viewTransform: t, containerW: W, imgW: iW } = latestRef.current;
    const refW = iW > 0 ? iW : W;
    setCrochetR(Math.max(0.1, (screenRPct / 100) * W / t.scale / refW * 100));
  }, []);

  const handleCrochetRyChange = useCallback((screenRPct: number) => {
    const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
    const refH = iH > 0 ? iH : H;
    setCrochetRy(Math.max(0.1, (screenRPct / 100) * H / t.scale / refH * 100));
  }, []);

  const handleCrochetRingUpdate = useCallback((i: number, ring: { cx: number; cy: number; r: number; ry?: number; shape?: string }) => {
    const { viewTransform: t, containerW: W, containerH: H, imgW: iW, imgH: iH } = latestRef.current;
    const refW = iW > 0 ? iW : W;
    const refH = iH > 0 ? iH : H;
    const screenX = (ring.cx / 100) * W;
    const contentX = (screenX - W / 2 - t.x) / t.scale + W / 2;
    const contentCx = iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
    const screenY = (ring.cy / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    const contentCy = iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
    const contentR = (ring.r / 100) * W / (refW * t.scale) * 100;
    const contentRy = ring.ry != null ? (ring.ry / 100) * H / (refH * t.scale) * 100 : undefined;
    setCompletedCrochetRings(prev => prev.map((r, idx) =>
      idx === i ? { ...r, cx: contentCx, cy: contentCy, r: contentR, ry: contentRy } : r
    ));
  }, []);

  const [crochetMarks, setCrochetMarks] = useState<CrochetMark[]>(
    img0?.crochet_marks ?? (pattern.progress?.crochet_marks as CrochetMark[]) ?? []
  );
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);

  const [knittingMarks, setKnittingMarks] = useState<KnittingMark[]>(
    img0?.knitting_marks ?? (pattern.progress?.knitting_marks as KnittingMark[]) ?? []
  );
  const [isPlacingKnittingMarker, setIsPlacingKnittingMarker] = useState(false);

  const [placingNoteKey, setPlacingNoteKey] = useState<string | null>(null);

  // Keep undoStateRef in sync with all undoable state
  useEffect(() => {
    undoStateRef.current = { subPatterns, activeSubId, rulerY, rulerHeight, rulerDirection, rulerOrientation, rulerX, completedMarks, crochetMarks, knittingMarks, crochetCx, crochetCy, crochetR, crochetRy, completedCrochetRings };
  }, [subPatterns, activeSubId, rulerY, rulerHeight, rulerDirection, rulerOrientation, rulerX, completedMarks, crochetMarks, knittingMarks, crochetCx, crochetCy, crochetR, crochetRy, completedCrochetRings]);

  const [notes, setNotes] = useState<Record<string, string>>(
    img0?.notes ?? (pattern.progress?.notes as Record<string, string>) ?? {}
  );
  const [notePositions, setNotePositions] = useState<Record<string, NotePosition>>(
    img0?.note_positions ?? (pattern.progress?.note_positions as Record<string, NotePosition>) ?? {}
  );
  const [prevRow, setPrevRow] = useState(activeSub?.current_row || 0);

  // Always-current snapshot of all per-image state (updated in render, like latestRef).
  // Used to save the current image's state before switching to another image.
  const perImageStateLatest = useRef<ImagePerState>({});
  perImageStateLatest.current = {
    ruler_position_y: rulerY,
    ruler_height: rulerHeight,
    ruler_position_x: rulerX,
    ruler_direction: rulerDirection,
    ruler_orientation: rulerOrientation,
    active_sub_id: activeSubId,
    completed_marks: completedMarks,
    knitting_marks: knittingMarks,
    crochet_marks: crochetMarks,
    crochet_ruler_data: { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, completedRings: completedCrochetRings },
    notes,
    note_positions: notePositions,
  };

  const updateActiveSub = useCallback((updater: (sub: SubPattern) => SubPattern) => {
    setSubPatterns((prev) =>
      prev.map((s) => (s.id === activeSubId ? updater(s) : s))
    );
  }, [activeSubId]);

  // When the user switches to a different image:
  // 1. Save current image's per-image state into imageStatesRef
  // 2. Restore the target image's saved state (or defaults for first visit)
  useEffect(() => {
    if (prevFileIdxRef.current === activeFileIdx) return;
    const prevIdx = prevFileIdxRef.current;
    prevFileIdxRef.current = activeFileIdx;

    // Show loading overlay while new image loads
    setIsImageLoading(true);
    // Safety: clear overlay after 8s in case image never reports dimensions (e.g., load error)
    if (imageLoadingTimeoutRef.current) clearTimeout(imageLoadingTimeoutRef.current);
    imageLoadingTimeoutRef.current = setTimeout(() => setIsImageLoading(false), 8000);

    // Save current state for the image we're leaving (deep copy to prevent shared array refs)
    imageStatesRef.current[prevIdx] = JSON.parse(JSON.stringify(perImageStateLatest.current));
    // Mark both images as visited
    setVisitedImageIndices(prev => new Set([...prev, prevIdx, activeFileIdx]));

    // Load state for the image we're switching to
    const next = imageStatesRef.current[activeFileIdx];

    setRulerY(next?.ruler_position_y ?? 50);
    setRulerHeight(next?.ruler_height ?? 0.3);
    setMaxRulerHeight(Math.max(1.35, next?.ruler_height ?? 0));
    setRulerX(next?.ruler_position_x ?? 50);
    setRulerDirection(next?.ruler_direction ?? 'up');
    setRulerOrientation(next?.ruler_orientation ?? 'vertical');
    setCompletedMarks(next?.completed_marks ?? []);
    setKnittingMarks(next?.knitting_marks ?? []);
    setCrochetMarks(next?.crochet_marks ?? []);

    const crd = next?.crochet_ruler_data;
    setCrochetShape((crd?.shape ?? 'circle') as 'line' | 'circle' | 'ellipse' | 'rect');
    setCrochetCx(crd?.cx ?? 50);
    setCrochetCy(crd?.cy ?? 50);
    setCrochetR(crd?.r ?? 3);
    setCrochetRy(crd?.ry ?? crd?.r ?? 3);
    const crdCx = crd?.cx ?? 50;
    const crdCy = crd?.cy ?? 50;
    setCompletedCrochetRings(
      (crd?.completedRings ?? []).map(r =>
        typeof r === 'number'
          ? { cx: crdCx, cy: crdCy, r }
          : { ...r, shape: r.shape as 'circle' | 'ellipse' | 'rect' | undefined }
      )
    );

    if (next?.active_sub_id) {
      setActiveSubId(next.active_sub_id);
    }

    setNotes(next?.notes ?? {});
    setNotePositions(next?.note_positions ?? {});

    // Reset undo/redo history for the new image
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    // Reset view so PatternViewer re-runs fit logic for the new image
    initialScrollDoneRef.current = false;
    // If this image has been visited before, go to ruler; otherwise fit from top
    isFirstOpenRef.current = !next;
    // Guides only show on image 0 — close them when switching to any other image
    if (activeFileIdx !== 0) {
      setShowSubPatternGuide(false);
      setShowCrochetShapeGuide(false);
      setShowGuide(false);
      setShowRulerGuide(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileIdx]);

  const handleCrochetCircleComplete = useCallback(() => {
    captureHistory();
    const { crochetR: cr, crochetRy: cry, crochetCx: cx, crochetCy: cy, completedCrochetRings: rings, crochetShape: shape } = latestRef.current;
    const is2D = shape === 'ellipse' || shape === 'rect';
    const lastRing = rings.length > 0 ? rings[rings.length - 1] : null;
    const lastR = lastRing ? lastRing.r : 0;
    const lastRy = lastRing ? (lastRing.ry ?? lastRing.r) : 0;
    const stepR = Math.max(cr - lastR, cr * 0.3);
    const stepRy = Math.max(cry - lastRy, cry * 0.3);
    setCompletedCrochetRings(prev => [...prev, {
      cx, cy, r: cr,
      ry: is2D ? cry : undefined,
      shape: shape === 'circle' ? undefined : shape as 'ellipse' | 'rect',
    }]);
    setCrochetR(cr + stepR);
    if (is2D) setCrochetRy(cry + stepRy);
    updateActiveSub(s => ({ ...s, current_row: s.current_row + 1 }));
  }, [captureHistory, updateActiveSub]);

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) userIdRef.current = session.user.id;
    });
  }, [supabase]);

  const isOnline = useOnlineStatus();
  // Keep a ref so saveFn (useCallback) can read the latest value without stale closure
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const saveFn = useCallback(
    async (data: Record<string, unknown>) => {
      let uid = userIdRef.current;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        uid = session.user.id;
        userIdRef.current = uid;
      }

      // Offline: queue locally and return without error (optimistic)
      if (!isOnlineRef.current) {
        enqueueOfflineUpdate({ patternId: pattern.id, userId: uid, data, queuedAt: Date.now() });
        return;
      }

      const { error } = await supabase
        .from('pattern_progress')
        .upsert(
          {
            pattern_id: pattern.id,
            user_id: uid,
            ...data,
          },
          { onConflict: 'pattern_id,user_id' }
        );
      if (error) {
        // Network dropped during save — queue instead of surfacing error
        if (!isOnlineRef.current) {
          enqueueOfflineUpdate({ patternId: pattern.id, userId: uid, data, queuedAt: Date.now() });
          return;
        }
        throw new Error(error.message);
      }
    },
    [supabase, pattern.id]
  );

  const { save, status } = useAutoSave(saveFn);

  useEffect(() => {
    // Keep imageStatesRef in sync with current image state before saving
    imageStatesRef.current[activeFileIdx] = JSON.parse(JSON.stringify(perImageStateLatest.current));
    save({
      current_row: activeSub?.current_row || 0,
      // Keep top-level columns for backward compat (image 0 values)
      ruler_position_y: activeFileIdx === 0 ? rulerY : (imageStatesRef.current[0]?.ruler_position_y ?? rulerY),
      ruler_height: activeFileIdx === 0 ? rulerHeight : (imageStatesRef.current[0]?.ruler_height ?? rulerHeight),
      ruler_direction: activeFileIdx === 0 ? rulerDirection : (imageStatesRef.current[0]?.ruler_direction ?? rulerDirection),
      ruler_orientation: activeFileIdx === 0 ? rulerOrientation : (imageStatesRef.current[0]?.ruler_orientation ?? rulerOrientation),
      ruler_position_x: activeFileIdx === 0 ? rulerX : (imageStatesRef.current[0]?.ruler_position_x ?? rulerX),
      completed_marks: activeFileIdx === 0 ? completedMarks : (imageStatesRef.current[0]?.completed_marks ?? completedMarks),
      crochet_marks: activeFileIdx === 0 ? crochetMarks : (imageStatesRef.current[0]?.crochet_marks ?? crochetMarks),
      knitting_marks: activeFileIdx === 0 ? knittingMarks : (imageStatesRef.current[0]?.knitting_marks ?? knittingMarks),
      notes: activeFileIdx === 0 ? notes : (imageStatesRef.current[0]?.notes ?? notes),
      note_positions: activeFileIdx === 0 ? notePositions : (imageStatesRef.current[0]?.note_positions ?? notePositions),
      crochet_ruler_data: activeFileIdx === 0
        ? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, completedRings: completedCrochetRings }
        : (imageStatesRef.current[0]?.crochet_ruler_data ?? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, completedRings: completedCrochetRings }),
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
      image_states: imageStatesRef.current,
    });
  }, [activeSub, activeFileIdx, rulerY, rulerHeight, rulerDirection, rulerOrientation, rulerX, completedMarks, crochetMarks, knittingMarks, notes, notePositions, subPatterns, activeSubId, crochetShape, crochetCx, crochetCy, crochetR, crochetRy, completedCrochetRings, save]);

  // Save all state immediately (used by save view button and back button)
  const saveAll = useCallback(() => {
    // Ensure current image state is flushed to imageStatesRef before saving
    imageStatesRef.current[activeFileIdx] = JSON.parse(JSON.stringify(perImageStateLatest.current));
    return saveFn({
      current_row: activeSub?.current_row || 0,
      ruler_position_y: activeFileIdx === 0 ? rulerY : (imageStatesRef.current[0]?.ruler_position_y ?? rulerY),
      ruler_height: activeFileIdx === 0 ? rulerHeight : (imageStatesRef.current[0]?.ruler_height ?? rulerHeight),
      ruler_direction: activeFileIdx === 0 ? rulerDirection : (imageStatesRef.current[0]?.ruler_direction ?? rulerDirection),
      ruler_orientation: activeFileIdx === 0 ? rulerOrientation : (imageStatesRef.current[0]?.ruler_orientation ?? rulerOrientation),
      ruler_position_x: activeFileIdx === 0 ? rulerX : (imageStatesRef.current[0]?.ruler_position_x ?? rulerX),
      completed_marks: activeFileIdx === 0 ? completedMarks : (imageStatesRef.current[0]?.completed_marks ?? completedMarks),
      crochet_marks: activeFileIdx === 0 ? crochetMarks : (imageStatesRef.current[0]?.crochet_marks ?? crochetMarks),
      knitting_marks: activeFileIdx === 0 ? knittingMarks : (imageStatesRef.current[0]?.knitting_marks ?? knittingMarks),
      notes: activeFileIdx === 0 ? notes : (imageStatesRef.current[0]?.notes ?? notes),
      note_positions: activeFileIdx === 0 ? notePositions : (imageStatesRef.current[0]?.note_positions ?? notePositions),
      crochet_ruler_data: activeFileIdx === 0
        ? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, completedRings: completedCrochetRings }
        : (imageStatesRef.current[0]?.crochet_ruler_data ?? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, completedRings: completedCrochetRings }),
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
      image_states: imageStatesRef.current,
    });
  }, [saveFn, activeFileIdx, activeSub, rulerY, rulerHeight, rulerDirection, rulerOrientation, rulerX, completedMarks, crochetMarks, knittingMarks, notes, notePositions, subPatterns, activeSubId, crochetShape, crochetCx, crochetCy, crochetR, crochetRy, completedCrochetRings]);

  // Explicit "save view" button
  const [saveViewStatus, setSaveViewStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [isSavingBack, setIsSavingBack] = useState(false);
  const saveViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current); }, []);

  const handleSaveView = useCallback(async () => {
    setSaveViewStatus('saving');
    await saveAll();
    setSaveViewStatus('done');
    if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current);
    saveViewTimerRef.current = setTimeout(() => setSaveViewStatus('idle'), 2000);
  }, [saveAll]);

  const handleRowChange = (row: number) => {
    captureHistory();
    setPrevRow(row);
    updateActiveSub((s) => ({ ...s, current_row: row }));
  };

  const handleNotesUpdate = useCallback(
    (updatedNotes: Record<string, string>) => {
      setNotes(updatedNotes);
      // Auto-add position for newly typed notes (no explicit placement yet).
      // Positions are NOT removed here — use handleNoteDelete to remove both.
      setNotePositions((prev) => {
        const next = { ...prev };
        let changed = false;
        const { rulerY: ry, rulerHeight: rh, containerH: H, containerW: W, imgH: iH, imgW: iW } = latestRef.current;
        // rulerY/rulerHeight are stored as image-space % (% of rendered image dims).
        // notePositions are container-space % (% of the full W×H container), since
        // note bubbles render inside the CSS transform at `left/top: pos%`.
        // Converting image-space → container-space avoids letterbox offset bugs.
        const imgTop = iH > 0 ? (H - iH) / 2 : 0;
        const refH = iH > 0 ? iH : H;
        const imgLeft = iW > 0 ? (W - iW) / 2 : 0;
        const refW = iW > 0 ? iW : W;
        const autoY = Math.max(0, Math.min(100, ((imgTop + (ry + rh / 2) / 100 * refH) / H) * 100));
        const autoX = Math.max(0, Math.min(100, ((imgLeft + 0.88 * refW) / W) * 100));
        for (const key of Object.keys(updatedNotes)) {
          if (!next[key]) {
            next[key] = { x: autoX, y: autoY };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    []
  );

  // Delete a note: removes both text and position
  const handleNoteDelete = useCallback((key: string) => {
    setNotes((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNotePositions((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleComplete = useCallback(() => {
    captureHistory();
    const { rulerY: ry, rulerHeight: rh, rulerX: rx, rulerOrientation: orientation } = latestRef.current;

    if (orientation === 'horizontal') {
      const newMark: CompletedMark = { y: rx, height: rh, orientation: 'horizontal' };
      setCompletedMarks((prev) => [...prev, newMark]);
      updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1 }));
      if (rulerDirection === 'up') {
        setRulerX(rx - rh);
      } else {
        setRulerX(rx + rh);
      }
    } else {
      const newMark: CompletedMark = { y: ry, height: rh };
      setCompletedMarks((prev) => [...prev, newMark]);
      updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1 }));
      if (rulerDirection === 'up') {
        setRulerY(ry - rh);
      } else {
        setRulerY(ry + rh);
      }
    }
  }, [captureHistory, rulerDirection, updateActiveSub]);

  // Convert screen % → content % for marker placement (markers now outside CSS transform)
  const screenToContent = useCallback((screenX: number, screenY: number) => {
    const { viewTransform: t, containerH: H, containerW: W } = latestRef.current;
    const sx = (screenX / 100) * W;
    const sy = (screenY / 100) * H;
    return {
      x: Math.max(0, Math.min(100, ((sx - W / 2 - t.x) / t.scale + W / 2) / W * 100)),
      y: Math.max(0, Math.min(100, ((sy - H / 2 - t.y) / t.scale + H / 2) / H * 100)),
    };
  }, []);

  // Place a note bubble at a tapped screen position (screen %)
  const handlePlaceNote = useCallback((screenX: number, screenY: number) => {
    if (!placingNoteKey) return;
    const pos = screenToContent(screenX, screenY);
    setNotePositions((prev) => ({ ...prev, [placingNoteKey]: pos }));
    setNotes((prev) => (placingNoteKey in prev ? prev : { ...prev, [placingNoteKey]: '' }));
    setPlacingNoteKey(null);
  }, [placingNoteKey, screenToContent]);

  const handlePlaceMarker = useCallback((screenX: number, screenY: number) => {
    captureHistory();
    const pos = screenToContent(screenX, screenY);
    const nextRow = (activeSub?.current_row || 0) + 1;
    const newMark: CrochetMark = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      label: String(nextRow),
    };
    setCrochetMarks((prev) => [...prev, newMark]);
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1 }));
    setIsPlacingMarker(false);
  }, [captureHistory, activeSub, updateActiveSub, screenToContent]);

  // CompletedOverlay is rendered outside the CSS transform (screen space),
  // so its y/height values are in screen % — convert back to image-relative % on update.
  const handleCompletedMarkUpdate = useCallback((index: number, screenMark: CompletedMark) => {
    if (screenMark.orientation === 'horizontal') {
      const { viewTransform: t, containerW: W, imgW: iW } = latestRef.current;
      const toImageXPct = (screenPct: number) => {
        const screenX = (screenPct / 100) * W;
        const contentX = (screenX - W / 2 - t.x) / t.scale + W / 2;
        return iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
      };
      const imageX = toImageXPct(screenMark.y);
      const imageRight = toImageXPct(screenMark.y + screenMark.height);
      setCompletedMarks((prev) => prev.map((m, i) =>
        i === index ? { y: imageX, height: imageRight - imageX, orientation: 'horizontal' as const } : m
      ));
    } else {
      const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
      const toImagePct = (screenPct: number) => {
        const screenY = (screenPct / 100) * H;
        const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
        return iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
      };
      const imageY = toImagePct(screenMark.y);
      const imageBottom = toImagePct(screenMark.y + screenMark.height);
      setCompletedMarks((prev) => prev.map((m, i) =>
        i === index ? { y: imageY, height: imageBottom - imageY } : m
      ));
    }
  }, []);

  const handleCompletedMarkDelete = useCallback((index: number) => {
    captureHistory();
    setCompletedMarks((prev) => prev.filter((_, i) => i !== index));
  }, [captureHistory]);

  const handleCompletedMarkDeleteAll = useCallback(() => { captureHistory(); setCompletedMarks([]); }, [captureHistory]);

  const handleCrochetMarkMove = useCallback((id: string, screenX: number, screenY: number) => {
    const pos = screenToContent(screenX, screenY);
    setCrochetMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x: pos.x, y: pos.y } : m)));
  }, [screenToContent]);

  const handleCrochetMarkDelete = useCallback((id: string) => {
    captureHistory();
    setCrochetMarks((prev) => prev.filter((m) => m.id !== id));
  }, [captureHistory]);

  const handleCrochetMarkDeleteAll = useCallback(() => { captureHistory(); setCrochetMarks([]); }, [captureHistory]);

  const handleCancelPlace = useCallback(() => setIsPlacingMarker(false), []);

  const handlePlaceKnittingMarker = useCallback((screenX: number, screenY: number) => {
    captureHistory();
    const pos = screenToContent(screenX, screenY);
    const newMark: KnittingMark = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      label: String(knittingMarks.length + 1),
    };
    setKnittingMarks((prev) => [...prev, newMark]);
    setIsPlacingKnittingMarker(false);
  }, [captureHistory, knittingMarks.length, screenToContent]);

  const handleKnittingMarkMove = useCallback((id: string, screenX: number, screenY: number) => {
    const pos = screenToContent(screenX, screenY);
    setKnittingMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x: pos.x, y: pos.y } : m)));
  }, [screenToContent]);

  const handleKnittingMarkDelete = useCallback((id: string) => {
    captureHistory();
    setKnittingMarks((prev) => prev.filter((m) => m.id !== id));
  }, [captureHistory]);

  const handleKnittingMarkDeleteAll = useCallback(() => { captureHistory(); setKnittingMarks([]); }, [captureHistory]);
  const handleCancelKnittingPlace = useCallback(() => setIsPlacingKnittingMarker(false), []);

  const handleNotePositionChange = useCallback((key: string, pos: NotePosition) => {
    setNotePositions((prev) => ({ ...prev, [key]: pos }));
  }, []);

  const handleAddSubPattern = () => {
    captureHistory();
    const newSub = createDefaultSubPattern(subPatterns.length + 1, t('sub.defaultPrefix'));
    setSubPatterns((prev) => [...prev, newSub]);
    setActiveSubId(newSub.id);
  };

  const handleUpdateSubPattern = (id: string, updates: Partial<SubPattern>) => {
    setSubPatterns((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleDeleteSubPattern = (id: string) => {
    captureHistory();
    setSubPatterns((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSubId === id && next.length > 0) {
        setActiveSubId(next[0].id);
      }
      return next;
    });
  };


  useEffect(() => {
    requestWakeLock();
    document.body.classList.add('viewer-open');
    return () => {
      releaseWakeLock();
      document.body.classList.remove('viewer-open');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All overlay components are outside the CSS transform — convert content % → screen %
  const toScreen = (cx: number, cy: number) => {
    const t = viewTransform;
    return {
      x: ((cx / 100) * containerW - containerW / 2) * t.scale + containerW / 2 + t.x,
      y: ((cy / 100) * containerH - containerH / 2) * t.scale + containerH / 2 + t.y,
    };
  };

  const screenKnittingMarks: KnittingMark[] = knittingMarks.map((m) => {
    const s = toScreen(m.x, m.y);
    return { ...m, x: (s.x / containerW) * 100, y: (s.y / containerH) * 100 };
  });

  const screenCrochetMarks: CrochetMark[] = crochetMarks.map((m) => {
    const s = toScreen(m.x, m.y);
    return { ...m, x: (s.x / containerW) * 100, y: (s.y / containerH) * 100 };
  });

  const screenCompletedMarks: CompletedMark[] = completedMarks.map((m) => {
    if (m.orientation === 'horizontal') {
      const x = contentToScreenX(m.y);
      const right = contentToScreenX(m.y + m.height);
      return { y: x, height: right - x, orientation: 'horizontal' as const };
    }
    const y = contentToScreenY(m.y);
    const bottom = contentToScreenY(m.y + m.height);
    return { y, height: bottom - y };
  });

  return (
    <div className="flex flex-col h-[100dvh] bg-[#f5edd6]">
      {/* Top bar */}
      <div className="bg-[#f5edd6] border-b-2 border-[#b07840] px-2 sm:px-4 py-2 flex items-center justify-between shrink-0 safe-top">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={async () => {
              if (isSavingBack) return;
              setIsSavingBack(true);
              await saveAll();
              navigate('/dashboard');
            }}
            disabled={isSavingBack}
            className="text-[#a08060] hover:text-[#3d2b1f] shrink-0 p-1 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {isSavingBack ? (
              <div className="w-4 h-4 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-[#3d2b1f] truncate text-sm sm:text-base tracking-tight">{pattern.title}</h1>
              <span className="hidden sm:inline text-[9px] font-bold tracking-widest uppercase bg-[#3d2b1f] text-[#fdf6e8] px-2 py-0.5 rounded shrink-0">
                {isCrochet ? t('card.type.crochet') : t('card.type.knitting')}
              </span>
            </div>
            <div className="flex items-center gap-2 min-h-[14px]">
              {(pattern.yarn || pattern.needle) && (
                <p className="hidden sm:block text-[11px] text-[#a08060] truncate">
                  {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
                </p>
              )}
              {!isOnline && (
                <span className="flex items-center gap-1 text-[10px] text-[#b07840] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b07840]" />
                  {t('offline.saving')}
                </span>
              )}
              {isOnline && status === 'saving' && (
                <span className="flex items-center gap-1 text-[10px] text-[#a08060] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b07840] animate-pulse" />
                  {t('form.saving')}
                </span>
              )}
              {isOnline && status === 'error' && (
                <span className="text-[10px] text-[#b5541e] font-medium shrink-0">
                  {t('view.autoSaveError')}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/patterns/${pattern.id}/edit`}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#b07840] transition-colors"
            title={t('view.edit')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </Link>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#b07840] disabled:opacity-25 transition-colors"
            title={t('view.undo')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#b07840] disabled:opacity-25 transition-colors"
            title={t('view.redo')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>

          {/* Save view button */}
          <button
            onClick={handleSaveView}
            disabled={saveViewStatus === 'saving'}
            className="h-9 px-2 flex items-center gap-1 rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#b07840] disabled:opacity-50 transition-colors"
            title={t('view.saveView')}
          >
            {saveViewStatus === 'done' ? (
              <>
                <svg className="w-4 h-4 text-[#7a9c72]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px] font-semibold text-[#7a9c72] tracking-wide">{t('view.saveViewDone')}</span>
              </>
            ) : saveViewStatus === 'saving' ? (
              <div className="w-4 h-4 border-2 border-[#b5541e] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 3v5H7V3" />
                <rect x="9" y="13" width="6" height="6" rx="0.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Offline cache notice */}
      {isFromCache && (
        <div className="bg-[#fdf6e8] border-b-2 border-[#d4b896] px-3 py-1.5 text-[10px] text-[#b07840] font-medium text-center shrink-0">
          {t('offline.cacheNote')}
        </div>
      )}

      {/* Image tab strip (shown only when multiple images exist) */}
      {allFiles.length > 1 && (
        <div className="flex gap-1 px-2 pt-1 overflow-x-auto flex-shrink-0">
          {allFiles.map((_, i) => {
            const isActive = activeFileIdx === i;
            const hasProgress = visitedImageIndices.has(i) && imageStatesRef.current[i] != null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActiveFileIdx(i)}
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-t-lg text-xs font-semibold tracking-wide border-2 border-b-0 transition-colors ${
                  isActive
                    ? 'border-[#b07840] bg-[#fdf6e8] text-[#3d2b1f]'
                    : 'border-transparent bg-transparent text-[#a08060] hover:text-[#7a5c46]'
                }`}
              >
                {t('form.imageN').replace('{n}', String(i + 1))}
                {hasProgress && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b5541e] opacity-70 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Viewer area */}
      <div className="flex-1 relative min-h-0 p-1 sm:p-2">
        <PatternViewer
          ref={viewerRef}
          fileUrl={allFiles[activeFileIdx]?.url ?? pattern.file_url}
          fileType={allFiles[activeFileIdx]?.file_type ?? pattern.file_type}
          rulerYPercent={isCrochet && crochetShape !== 'line' ? crochetCy : rulerOrientation === 'horizontal' ? 50 : rulerY + rulerHeight / 2}
          rulerXPercent={isCrochet && crochetShape !== 'line' ? crochetCx : rulerOrientation === 'horizontal' ? rulerX + rulerHeight / 2 : undefined}
          onTransformChange={handleTransformChange}
          onImageSize={handleImageSize}
          highlightBringRuler={showGuide}
          onResetRuler={isCrochet && crochetShape !== 'line' ? () => {
            const { viewTransform: t, containerW: W, containerH: H, imgW: iW, imgH: iH } = latestRef.current;
            const contentX = W / 2 - t.x / t.scale;
            const contentY = H / 2 - t.y / t.scale;
            const cx = iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
            const cy = iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
            setCrochetCx(cx);
            setCrochetCy(cy);
            if (showGuideRef.current) {
              setShowGuide(false);
              setShowRulerGuide(true);
            }
          } : () => {
            const { viewTransform: t, containerH: H, containerW: W, imgH: iH, imgW: iW, rulerHeight: rh, rulerOrientation: orientation } = latestRef.current;
            if (orientation === 'horizontal') {
              const contentX = W / 2 - t.x / t.scale;
              const refW = iW > 0 ? iW : W;
              const offsetX = iW > 0 ? (W - iW) / 2 : 0;
              setRulerX((contentX - offsetX) / refW * 100 - rh / 2);
            } else {
              const contentY = H / 2 - t.y / t.scale;
              const refH = iH > 0 ? iH : H;
              const offset = iH > 0 ? (H - iH) / 2 : 0;
              setRulerY((contentY - offset) / refH * 100 - rh / 2);
            }
            if (showGuideRef.current) {
              setShowGuide(false);
              setShowRulerGuide(true);
            }
          }}
          contentOverlay={
            <NoteBubbles
              notes={notes}
              positions={notePositions}
              onPositionChange={handleNotePositionChange}
              onDelete={handleNoteDelete}
              scale={viewTransform.scale}
            />
          }
        >
          {!isCrochet && (
            <KnittingMarkers
              marks={screenKnittingMarks}
              isPlacing={isPlacingKnittingMarker}
              onPlace={handlePlaceKnittingMarker}
              onMove={handleKnittingMarkMove}
              onDelete={handleKnittingMarkDelete}
              onDeleteAll={handleKnittingMarkDeleteAll}
              onCancelPlace={handleCancelKnittingPlace}
              onDragStart={captureHistory}
            />
          )}
          {isCrochet && (
            <CrochetMarkers
              marks={screenCrochetMarks}
              isPlacing={isPlacingMarker}
              onPlace={handlePlaceMarker}
              onMove={handleCrochetMarkMove}
              onDelete={handleCrochetMarkDelete}
              onDeleteAll={handleCrochetMarkDeleteAll}
              onCancelPlace={handleCancelPlace}
              onDragStart={captureHistory}
            />
          )}
          <CompletedOverlay
            marks={screenCompletedMarks}
            onUpdate={handleCompletedMarkUpdate}
            onDelete={handleCompletedMarkDelete}
            onDeleteAll={handleCompletedMarkDeleteAll}
            onSelectionChange={setHasMarkSelection}
            onDragStart={captureHistory}
          />
          {(!isCrochet || crochetShape === 'line') && !showGuide && imgH > 0 && (
            <RowRuler
              positionY={screenRulerY}
              height={rulerOrientation === 'horizontal' ? screenRulerWidth : screenRulerHeight}
              direction={rulerDirection}
              orientation={rulerOrientation}
              positionX={screenRulerX}
              isAdjusting={isAdjustingRuler}
              isPlacingMarker={isPlacingKnittingMarker}
              showSettings={showRulerSettings}
              onChangePosition={handleRulerPositionChange}
              onChangePositionX={handleRulerPositionXChange}
              onChangeHeight={handleRulerHeightChange}
              onComplete={handleComplete}
              onToggleSettings={() => setShowRulerSettings((v) => !v)}
              onDragStart={captureHistory}
            />
          )}

          {isCrochet && crochetShape !== 'line' && imgH > 0 && (
            <CrochetRuler
              cx={contentToScreenX(crochetCx)}
              cy={contentToScreenY(crochetCy)}
              r={contentToScreenR(crochetR)}
              ry={(crochetShape === 'ellipse' || crochetShape === 'rect') ? contentToScreenRy(crochetRy) : undefined}
              shape={crochetShape === 'ellipse' ? 'ellipse' : crochetShape === 'rect' ? 'rect' : 'circle'}
              completedRings={completedCrochetRings.map(ring => ({
                cx: contentToScreenX(ring.cx),
                cy: contentToScreenY(ring.cy),
                r: contentToScreenR(ring.r),
                ry: ring.ry != null ? contentToScreenRy(ring.ry) : undefined,
                shape: ring.shape,
              }))}
              containerW={containerW}
              containerH={containerH}
              onCenterChange={handleCrochetCenterChange}
              onRadiusChange={handleCrochetRadiusChange}
              onRyChange={(crochetShape === 'ellipse' || crochetShape === 'rect') ? handleCrochetRyChange : undefined}
              onComplete={handleCrochetCircleComplete}
              onToggleSettings={() => setShowCrochetSettings(v => !v)}
              showSettings={showCrochetSettings}
              isAdjusting={isAdjustingCrochetRadius}
              onAdjustingChange={setIsAdjustingCrochetRadius}
              onDragStart={captureHistory}
              onDeleteRing={(i) => { captureHistory(); setCompletedCrochetRings(prev => prev.filter((_, idx) => idx !== i)); }}
              onDeleteAllRings={() => { captureHistory(); setCompletedCrochetRings([]); }}
              onUpdateRing={(i, ring) => { captureHistory(); handleCrochetRingUpdate(i, ring); }}
              onReset={() => {
                captureHistory();
                setCompletedCrochetRings([]);
                const { viewTransform: t, containerW: W, containerH: H, imgW: iW, imgH: iH } = latestRef.current;
                const contentX = W / 2 - t.x / t.scale;
                const contentY = H / 2 - t.y / t.scale;
                const cx = iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
                const cy = iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
                setCrochetCx(cx);
                setCrochetCy(cy);
                setCrochetR(10);
                setCrochetRy(10);
              }}
            />
          )}
          {isCrochet && crochetShape === 'line' && completedCrochetRings.length > 0 && imgH > 0 && (
            <CrochetRuler
              ringsOnly
              completedRings={completedCrochetRings.map(ring => ({
                cx: contentToScreenX(ring.cx),
                cy: contentToScreenY(ring.cy),
                r: contentToScreenR(ring.r),
                ry: ring.ry != null ? contentToScreenRy(ring.ry) : undefined,
                shape: ring.shape,
              }))}
              containerW={containerW}
              containerH={containerH}
              onDragStart={captureHistory}
              onDeleteRing={(i) => { captureHistory(); setCompletedCrochetRings(prev => prev.filter((_, idx) => idx !== i)); }}
              onDeleteAllRings={() => { captureHistory(); setCompletedCrochetRings([]); }}
              onUpdateRing={(i, ring) => { captureHistory(); handleCrochetRingUpdate(i, ring); }}
            />
          )}

          {/* Note placement overlay */}
          {placingNoteKey !== null && (
            <div
              className="absolute inset-0 z-[60] cursor-crosshair"
              onPointerDown={(e) => {
                if (e.isPrimary === false) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const screenX = ((e.clientX - rect.left) / rect.width) * 100;
                const screenY = ((e.clientY - rect.top) / rect.height) * 100;
                handlePlaceNote(screenX, screenY);
              }}
            >
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#b07840] text-[#fdf6e8] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none select-none">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/>
                </svg>
                {t('notes.placeHint')}
              </div>
              <button
                className="absolute top-3 right-3 pointer-events-auto bg-[#fdf6e8]/90 text-[#7a5c46] rounded-full w-9 h-9 flex items-center justify-center hover:bg-[#fdf6e8] border border-[#b07840] shadow"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setPlacingNoteKey(null)}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </PatternViewer>

        {/* Image loading overlay — shown while new image is loading after a tab switch */}
        {isImageLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#fdf6e8]/70 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-[3px] border-[#b07840] border-t-[#b5541e] rounded-full animate-spin" />
            </div>
          </div>
        )}

        {/* Sub-pattern setup guide — shown on very first open */}
        {showSubPatternGuide && (
          <div className="absolute inset-0 z-40 flex items-start justify-center pt-4 bg-black/40 backdrop-blur-[2px]">
            <div className="mx-4 bg-[#fdf6e8] rounded-2xl border-2 border-[#b07840] shadow-[4px_4px_0_#b07840] p-5 max-w-xs w-full">
              <h2 className="text-sm font-bold text-[#3d2b1f] tracking-tight mb-2">
                {t('guide.subPattern.title')}
              </h2>
              <p className="text-[11px] text-[#7a5c46] leading-relaxed mb-5">
                {t('guide.subPattern.desc')}
              </p>
              <button
                onClick={() => { setShowSubPatternGuide(false); if (isCrochet) setShowCrochetShapeGuide(true); else setShowGuide(true); }}
                className="w-full bg-[#b5541e] text-[#fdf6e8] py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318]"
              >
                {t('guide.subPattern.next')}
              </button>
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#b5541e] cursor-pointer"
                  onChange={(e) => {
                    if (e.target.checked) {
                      localStorage.setItem('kis_guide_dismissed', 'true');
                      setShowSubPatternGuide(false);
                      setShowCrochetShapeGuide(false);
                      setShowGuide(false);
                      setShowRulerGuide(false);
                    }
                  }}
                />
                <span className="text-[11px] text-[#a08060]">{t('guide.dontShowAgain')}</span>
              </label>
            </div>
          </div>
        )}

        {/* Crochet shape selection guide */}
        {showCrochetShapeGuide && (
          <div className="absolute inset-0 z-40 flex items-start justify-center pt-4 bg-black/40 backdrop-blur-[2px]">
            <div className="mx-4 bg-[#fdf6e8] rounded-2xl border-2 border-[#b07840] shadow-[4px_4px_0_#b07840] p-5 max-w-xs w-full">
              <h2 className="text-sm font-bold text-[#3d2b1f] tracking-tight mb-2">
                {t('guide.crochetShape.title')}
              </h2>
              <p className="text-[11px] text-[#7a5c46] leading-relaxed mb-4">
                {t('guide.crochetShape.desc')}
              </p>
              <div className="flex gap-2">
                {(['line', 'circle', 'ellipse', 'rect'] as const).map((shape) => (
                  <button
                    key={shape}
                    onClick={() => { setCrochetShape(shape); setShowCrochetShapeGuide(false); setShowGuide(true); }}
                    className="flex-1 py-2.5 rounded-lg text-xs font-bold tracking-wide border-2 bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                  >
                    {t(`crochet.shape.${shape}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* First-time initial guide — non-blocking floating banner */}
        {showGuide && (
          <div className="absolute inset-x-0 bottom-24 z-40 flex justify-center pointer-events-none px-4">
            <div className="bg-[#fdf6e8]/95 backdrop-blur-sm rounded-2xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] px-5 py-4 max-w-xs w-full">
              <p className="text-sm text-[#3d2b1f] text-center leading-relaxed">
                {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.initial`) : t('guide.initial')}
              </p>
            </div>
          </div>
        )}

        {/* Ruler settings guide — shown after first '진행선 가져오기' click */}
        {showRulerGuide && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="mx-4 bg-[#fdf6e8] rounded-2xl border-2 border-[#b07840] shadow-[4px_4px_0_#b07840] p-5 max-w-xs w-full">
              <h2 className="text-sm font-bold text-[#3d2b1f] tracking-tight mb-3">
                {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.title`) : t('guide.title')}
              </h2>
              <ol className="space-y-3 mb-5">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#b5541e] text-[#fdf6e8] text-[10px] font-bold flex items-center justify-center">1</span>
                  <div>
                    <p className="text-xs font-semibold text-[#3d2b1f]">
                      {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.step1.title`) : t('guide.step1.title')}
                    </p>
                    <p className="text-[11px] text-[#7a5c46] mt-0.5">
                      {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.step1.desc`) : t('guide.step1.desc')}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#b5541e] text-[#fdf6e8] text-[10px] font-bold flex items-center justify-center">2</span>
                  <div>
                    <p className="text-xs font-semibold text-[#3d2b1f]">
                      {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.step2.title`) : t('guide.step2.title')}
                    </p>
                    <p className="text-[11px] text-[#7a5c46] mt-0.5">
                      {(isCrochet && crochetShape !== 'line') ? t(`guide.crochet.${crochetShape}.step2.desc`) : t('guide.step2.desc')}
                    </p>
                  </div>
                </li>
              </ol>
              <button
                onClick={() => { setShowRulerGuide(false); if (!isCrochet || crochetShape === 'line') setShowRulerSettings(true); }}
                className="w-full bg-[#b5541e] text-[#fdf6e8] py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318]"
              >
                {t('guide.start')}
              </button>
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#b5541e] cursor-pointer"
                  onChange={(e) => {
                    if (e.target.checked) {
                      localStorage.setItem('kis_guide_dismissed', 'true');
                      setShowSubPatternGuide(false);
                      setShowCrochetShapeGuide(false);
                      setShowGuide(false);
                      setShowRulerGuide(false);
                    }
                  }}
                />
                <span className="text-[11px] text-[#a08060]">{t('guide.dontShowAgain')}</span>
              </label>
            </div>
          </div>
        )}

        {/* Crochet shape selector */}
        {isCrochet && (
          <div className="absolute top-3 right-3 z-30 flex flex-col gap-1">
            {([
              { key: 'line', label: t('crochet.shape.line') },
              { key: 'circle', label: t('crochet.shape.circle') },
              { key: 'ellipse', label: t('crochet.shape.ellipse') },
              { key: 'rect', label: t('crochet.shape.rect') },
            ] as { key: string; label: string; disabled?: boolean }[]).map(({ key, label, disabled }) => (
              <button
                key={key}
                disabled={disabled}
                onClick={() => setCrochetShape(key as 'line' | 'circle' | 'ellipse' | 'rect')}
                className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-[10px] font-bold tracking-wide border-2 transition-colors ${
                  crochetShape === key
                    ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318] shadow-[1px_1px_0_#9a4318]'
                    : disabled
                    ? 'bg-[#fdf6e8]/60 text-[#c4a882] border-[#d4b896] cursor-not-allowed opacity-50'
                    : 'bg-[#fdf6e8]/90 text-[#7a5c46] border-[#b07840] hover:border-[#b5541e]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Ruler height settings popup — layout depends on orientation */}
        {showRulerSettings && (!isCrochet || crochetShape === 'line') && (() => {
          const facingDeg =
            rulerOrientation === 'vertical' && rulerDirection === 'up' ? 0 :
            rulerOrientation === 'horizontal' && rulerDirection === 'down' ? 90 :
            rulerOrientation === 'vertical' && rulerDirection === 'down' ? 180 : 270;
          /* Shared close button */
          const closeBtn = (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setShowRulerSettings(false)}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0"
              title="닫기"
            >×</button>
          );

          if (rulerOrientation === 'horizontal') {
            return (
              /* Horizontal mode: fixed top-left */
              <div
                className="absolute z-30 bg-[#fdf6e8]/96 backdrop-blur-sm rounded-xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] px-2.5 py-2 flex flex-col gap-1.5"
                style={{ top: '8px', left: '8px', maxWidth: 'calc(100% - 16px)' }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Direction row + close */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="#b5541e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: `rotate(${facingDeg}deg)`, transition: 'transform 0.2s ease', flexShrink: 0 }}
                    >
                      <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                    </svg>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRotateRuler()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#b07840] bg-white text-[#b5541e] text-[10px] font-semibold hover:bg-[#fdf6e8] active:scale-95 transition-all select-none"
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {t('ruler.rotate')}
                    </button>
                  </div>
                  {closeBtn}
                </div>
                <div className="border-t border-[#d4b896] -mx-2.5" />
                {/* Width controls */}
                <div className="flex items-center gap-1">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setMaxRulerHeight((m) => Math.max(0.001, m / 1.3))}
                    className="flex items-center justify-center min-w-[44px] h-9 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none flex-shrink-0"
                    title="최대 너비 30% 축소"
                  >÷1.3</button>
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                    onClick={() => setRulerHeight((h) => Math.max(0.001, h / 1.05))}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none flex-shrink-0"
                  >−</button>
                  <input
                    type="range" min={0} max={10000} step={1}
                    value={Math.round(Math.min(rulerHeight, maxRulerHeight) / maxRulerHeight * 10000)}
                    onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                    onChange={(e) => { setIsAdjustingRuler(true); setRulerHeight(Math.max(0.001, Number(e.target.value) / 10000 * maxRulerHeight)); }}
                    onPointerUp={() => setIsAdjustingRuler(false)}
                    onPointerCancel={() => setIsAdjustingRuler(false)}
                    className="accent-[#b5541e] cursor-pointer flex-1 min-w-0"
                    style={{ height: '24px', maxWidth: '80px' }}
                  />
                  <button
                    onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                    onClick={() => setRulerHeight((h) => Math.min(maxRulerHeight, h * 1.05))}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none flex-shrink-0"
                  >+</button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setMaxRulerHeight((m) => m * 1.3)}
                    className="flex items-center justify-center min-w-[44px] h-9 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none flex-shrink-0"
                    title="최대 너비 30% 확장"
                  >×1.3</button>
                  <span className="text-[10px] text-[#b5541e] font-mono leading-tight flex-shrink-0">
                    {(rulerHeight / maxRulerHeight * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          }

          return (
            /* Vertical mode: fixed top-left */
            <div
              className="absolute z-30 bg-[#fdf6e8]/96 backdrop-blur-sm rounded-xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] px-2 py-2 flex flex-col items-center gap-1.5"
              style={{ top: '8px', left: '8px' }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Close button row */}
              <div className="flex items-center justify-between w-full gap-1">
                <div className="flex items-center gap-1">
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="#b5541e" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: `rotate(${facingDeg}deg)`, transition: 'transform 0.2s ease', flexShrink: 0 }}
                  >
                    <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
                  </svg>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleRotateRuler()}
                    className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-[#b07840] bg-white text-[#b5541e] text-[9px] font-semibold hover:bg-[#fdf6e8] active:scale-95 transition-all select-none"
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('ruler.rotate')}
                  </button>
                </div>
                {closeBtn}
              </div>
              <div className="border-t border-[#d4b896] w-full" />
              {/* Height controls */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setMaxRulerHeight((m) => m * 1.3)}
                className="flex items-center justify-center w-11 h-9 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none"
                title="최대 높이 30% 확장"
              >×1.3</button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                onClick={() => setRulerHeight((h) => Math.min(maxRulerHeight, h * 1.05))}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
              >+</button>
              <input
                type="range" min={0} max={10000} step={1}
                value={Math.round(Math.min(rulerHeight, maxRulerHeight) / maxRulerHeight * 10000)}
                onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                onChange={(e) => { setIsAdjustingRuler(true); setRulerHeight(Math.max(0.001, Number(e.target.value) / 10000 * maxRulerHeight)); }}
                onPointerUp={() => setIsAdjustingRuler(false)}
                onPointerCancel={() => setIsAdjustingRuler(false)}
                className="accent-[#b5541e] cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '24px', height: '90px' }}
              />
              <button
                onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                onClick={() => setRulerHeight((h) => Math.max(0.001, h / 1.05))}
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
              >−</button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setMaxRulerHeight((m) => Math.max(0.001, m / 1.3))}
                className="flex items-center justify-center w-11 h-9 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[9px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none"
                title="최대 높이 30% 축소"
              >÷1.3</button>
              <span className="text-[9px] text-[#b5541e] font-mono text-center leading-tight">
                {(rulerHeight / maxRulerHeight * 100).toFixed(0)}%
              </span>
            </div>
          );
        })()}


        {hasMarkSelection && completedMarks.length > 1 && (
          <div className="absolute top-4 right-4 z-30">
            <button
              onClick={() => {
                if (confirm(t('view.deleteAllMarks'))) {
                  setCompletedMarks([]);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-[#9a4318]/90 text-[#fdf6e8] rounded-full hover:bg-[#9a4318] transition-colors shadow-md border border-[#7a3310]"
            >
              {t('view.deleteAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls — compact single row + collapsible notes */}
      <div className="bg-[#fdf6e8] border-t-2 border-[#b07840] shrink-0 safe-bottom">
        {/* Single control row: SubPattern | slim progress bar | counter | markers */}
        <div
          className={`px-2 sm:px-3 py-1.5 flex items-center gap-1.5 sm:gap-2 transition-all ${showSubPatternGuide ? 'animate-pulse' : ''}`}
          style={showSubPatternGuide ? { outline: '2px dashed #b5541e', outlineOffset: '2px' } : {}}
        >
          <SubPatternSelector
            subPatterns={subPatterns}
            activeId={activeSubId}
            isCrochet={isCrochet}
            initialExpanded={showSubPatternGuide}
            onSelect={setActiveSubId}
            onAdd={handleAddSubPattern}
            onUpdate={handleUpdateSubPattern}
            onDelete={handleDeleteSubPattern}
          />

          {/* Slim progress bar — fills remaining space */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-[#f5edd6] border border-[#b07840] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#b5541e] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, ((activeSub?.current_row || 0) / Math.max(1, activeSub?.total_rows || 1)) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-[#a08060] font-mono shrink-0 leading-none">
              {Math.round(Math.min(100, ((activeSub?.current_row || 0) / Math.max(1, activeSub?.total_rows || 1)) * 100))}%
            </span>
          </div>

          {/* Row/round counter */}
          {isCrochet ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleRowChange(Math.max(0, (activeSub?.current_row || 0) - 1))}
                disabled={(activeSub?.current_row || 0) <= 0}
                className="w-9 h-9 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-[#7a5c46] text-lg font-bold flex items-center justify-center hover:border-[#b5541e] hover:text-[#b5541e] disabled:opacity-30 transition-colors"
              >−</button>
              <div className="text-center min-w-[38px]">
                <div className="text-base font-bold text-[#3d2b1f] leading-tight">{activeSub?.current_row || 0}</div>
                <div className="text-[9px] text-[#a08060] leading-tight">{t('counter.rowOf', { total: activeSub?.total_rows || 1 })}</div>
              </div>
              <button
                onClick={() => handleRowChange((activeSub?.current_row || 0) + 1)}
                className="w-9 h-9 rounded-lg border-2 border-[#9a4318] bg-[#b5541e] text-[#fdf6e8] text-lg font-bold flex items-center justify-center hover:bg-[#9a4318] transition-colors shadow-[2px_2px_0_#9a4318]"
              >+</button>
            </div>
          ) : (
            <RowCounter
              current={activeSub?.current_row || 0}
              total={activeSub?.total_rows || 1}
              onChange={handleRowChange}
            />
          )}

          {/* Marker button(s) */}
          {isCrochet ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsPlacingMarker(true)}
                disabled={isPlacingMarker}
                className="flex items-center gap-1 px-2 py-1.5 h-9 text-[11px] font-bold tracking-wide bg-[#b5541e] text-[#fdf6e8] rounded-lg border-2 border-[#9a4318] hover:bg-[#9a4318] disabled:opacity-50 transition-colors shadow-[2px_2px_0_#9a4318]"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {crochetMarks.length > 0 && <span>{crochetMarks.length}</span>}
              </button>
              {crochetMarks.length > 0 && (
                <button
                  onClick={() => { if (confirm(t('marker.deleteConfirm'))) handleCrochetMarkDeleteAll(); }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                  title={t('marker.deleteTitle')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setIsPlacingKnittingMarker(true)}
                disabled={isPlacingKnittingMarker}
                className="flex items-center gap-1 px-2 py-1.5 h-9 text-[11px] font-bold tracking-wide bg-[#8b6b4a] text-[#fdf6e8] rounded-lg border-2 border-[#6b4f36] hover:bg-[#6b4f36] disabled:opacity-50 transition-colors shadow-[2px_2px_0_#6b4f36]"
                title={t('marker.place')}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {knittingMarks.length > 0 && <span>{knittingMarks.length}</span>}
              </button>
              {knittingMarks.length > 0 && (
                <button
                  onClick={() => { if (confirm(t('marker.deleteConfirm'))) handleKnittingMarkDeleteAll(); }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                  title={t('marker.deleteTitle')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes — collapsible, scrollable */}
        <div className="px-2 sm:px-3 pb-1.5 sm:pb-2 overflow-y-auto max-h-[28vh] sm:max-h-[20vh]">
          <PatternNotes
            currentRow={activeSub?.current_row || 0}
            activeSubPattern={activeSub || subPatterns[0]}
            subPatterns={subPatterns}
            notes={notes}
            notePositions={notePositions}
            onUpdate={handleNotesUpdate}
            onDelete={handleNoteDelete}
            onPlaceNote={setPlacingNoteKey}
          />
        </div>
      </div>
    </div>
  );
}
