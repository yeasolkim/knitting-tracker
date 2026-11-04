import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import YarnLoader from '@/components/YarnLoader';
import { createClient } from '@/lib/supabase/client';
import type { CrochetRulerData, PatternWithProgress, PatternProgress, PatternType, CompletedMark, RulerDirection, RulerOrientation, NotePosition, SubPattern, CrochetMark, KnittingMark, ImagePerState, DrawPath, DrawTool, Ruler } from '@/lib/types';
import type { SetStateAction } from 'react';
import type { TranslationKey } from '@/lib/i18n';
import InactiveRulerBand from '@/components/InactiveRulerBand';
import HelpSheet from '@/components/HelpSheet';
import StitchCounter from '@/components/StitchCounter';
import { getPref, setPref, getViewLocked, setViewLocked, applyTextSize, getSession, addSession, type TextSize } from '@/lib/prefs';
import { useMediaQuery, LANDSCAPE_PHONE_QUERY } from '@/hooks/useMediaQuery';
import { buildProgressImage, shareOrDownload, downloadJson } from '@/lib/exportProgress';
import { repeatInfoForRow } from '@/lib/repeat';
import DrawingCanvas from '@/components/DrawingCanvas';
import PatternViewer, { type PatternViewerHandle } from '@/components/PatternViewer';
import RowRuler from '@/components/RowRuler';
import HoldRepeatButton from '../components/HoldRepeatButton';
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
import { enqueueOfflineUpdate, cachePattern, getCachedPattern, hasOfflineQueue } from '@/lib/offlineQueue';

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
  const { t } = useLanguage();
  const [pattern, setPattern] = useState<PatternWithProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) { navigate('/login'); return; }

        const queryResult = await supabase
          .from('patterns')
          .select(`*, progress:pattern_progress(*)`)
          .eq('id', id!)
          .single();

        if (cancelled) return;

        if (queryResult.error || !queryResult.data) {
          if (!navigator.onLine && id) {
            const cached = getCachedPattern(id);
            if (cached) { setPattern(cached); setIsFromCache(true); setLoading(false); return; }
          }
          setLoading(false);
          setLoadError(true);
          return;
        }

        const loaded: PatternWithProgress = {
          ...queryResult.data,
          progress: queryResult.data.progress?.[0] || null,
        } as PatternWithProgress;
        cachePattern(loaded);
        setPattern(loaded);
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (!navigator.onLine && id) {
          const cached = getCachedPattern(id);
          if (cached) { setPattern(cached); setIsFromCache(true); setLoading(false); return; }
        }
        setLoading(false);
        setLoadError(true);
      }
    })();

    return () => { cancelled = true; };
  }, [id, navigate]);

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5edd6] p-8">
        <p className="text-[#3d2b1f] text-center font-semibold">{t('load.error.title')}</p>
        <p className="text-sm text-[#7a5c46] text-center">{t('load.error.desc')}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2.5 bg-[#b5541e] text-[#fdf6e8] rounded-lg text-sm font-bold hover:bg-[#9a4318] transition-colors border-2 border-[#9a4318]"
        >
          {t('load.error.toDashboard')}
        </button>
      </div>
    );
  }

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

type CrochetRing = { cx: number; cy: number; r: number; rInner?: number; ry?: number; ryInner?: number; shape?: 'circle' | 'ellipse' | 'rect'; sweep?: { start: number; end: number } };

type Snapshot = {
  subPatterns: SubPattern[];
  activeSubId: string;
  rulers: Ruler[];
  activeRulerId: string;
  completedMarks: CompletedMark[];
  crochetMarks: CrochetMark[];
  knittingMarks: KnittingMark[];
  crochetCx: number;
  crochetCy: number;
  crochetR: number;
  crochetRy: number;
  crochetRowHeight: number | null;
  crochetRotation: number;
  completedCrochetRings: CrochetRing[];
  drawingPaths: DrawPath[];
  notes: Record<string, string>;
  notePositions: Record<string, NotePosition>;
};

const MAX_HISTORY = 20;
const MAX_RULERS = 4;
// Band colors per ruler slot. Ruler 1 keeps the app accent; its completed marks keep the default green.
// Colour-blind friendly set (Okabe–Ito based). Brand orange first; no greens (completed marks are green).
const RULER_COLORS = ['#b5541e', '#0072B2', '#CC79A7', '#56B4E9', '#6A3D9A', '#4B5563'];
const DEFAULT_RULER_COLOR = RULER_COLORS[0];

/**
 * Build the ruler list for an image. New-format `rulers` wins; otherwise one ruler is
 * synthesized from the legacy ruler_* fields (falling back to top-level progress columns).
 * `hasSavedHeight` tells the caller whether the 1/20-screen height init should be skipped.
 */
function buildRulers(
  state: ImagePerState | undefined,
  progress: PatternProgress | null | undefined,
  patternType: PatternType,
  nameFor: (n: number) => string,
): { rulers: Ruler[]; activeId: string; hasSavedHeight: boolean } {
  const saved = state?.rulers;
  if (saved && saved.length > 0) {
    const rulers: Ruler[] = saved.map((r, i) => ({
      ...r,
      id: r.id || generateId(),
      name: r.name || nameFor(i + 1),
      color: r.color || RULER_COLORS[i % RULER_COLORS.length],
      rotation: r.rotation ?? 0,
      position_x: r.position_x ?? 50,
      position_y: r.position_y ?? 10,
      direction: r.direction ?? 'up',
      orientation: r.orientation ?? 'vertical',
      height: Math.min(LOG_RULER_MAX, r.height ?? 5),
    }));
    const activeId = rulers.some((r) => r.id === state?.active_ruler_id) ? state!.active_ruler_id! : rulers[0].id;
    return { rulers, activeId, hasSavedHeight: rulers[0].height > 0 };
  }
  const savedRh = state?.ruler_height ?? progress?.ruler_height ?? undefined;
  const crd = (state?.crochet_ruler_data ?? progress?.crochet_ruler_data) as { shape?: string } | undefined;
  const isCrochetLine = patternType === 'crochet' && (crd?.shape ?? 'circle') === 'line';
  const hasSavedHeight = savedRh != null && savedRh > 0;
  const height = hasSavedHeight ? Math.min(LOG_RULER_MAX, savedRh!) : isCrochetLine ? 10 : 5; // 5 = placeholder, corrected to containerH/20 after layout
  const ruler: Ruler = {
    id: generateId(),
    name: nameFor(1),
    position_y: state?.ruler_position_y ?? progress?.ruler_position_y ?? 10,
    position_x: state?.ruler_position_x ?? (progress?.ruler_position_x as number | null | undefined) ?? 50,
    height,
    direction: state?.ruler_direction ?? (progress?.ruler_direction as RulerDirection | undefined) ?? 'up',
    orientation: state?.ruler_orientation ?? (progress?.ruler_orientation as RulerOrientation | undefined) ?? 'vertical',
    rotation: state?.ruler_rotation ?? (progress?.ruler_rotation as number | null | undefined) ?? 0,
    color: RULER_COLORS[0],
  };
  return { rulers: [ruler], activeId: ruler.id, hasSavedHeight };
}
const isTextInputTarget = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
const LOG_RULER_MAX = 50;    // % of image dimension — max ruler height
// Initial ruler thickness on screen: ~1/18 of the viewer, but always finger-sized.
const INIT_RULER_PX_MIN = 28;
const INIT_RULER_PX_MAX = 44;
const INIT_RULER_PX_FLOOR_DENSE = 20; // never thinner than this even on very dense charts

/**
 * Default ruler height (image %) for a chart that has no saved height yet.
 * - Target ~1/18 of the viewer height on screen, clamped to [28, 44] px.
 * - Density cap: when the pattern declares its row count, keep the band at most
 *   1.5 estimated rows (image height ÷ rows), but never below 20 px.
 * - `boost` scales the result (used by the onboarding guide to make the band obvious).
 */
function defaultRulerHeightPct(args: {
  containerH: number; imgH: number; imgW: number; scale: number;
  orientation?: RulerOrientation; totalRows?: number; boost?: number;
}): number | null {
  const { containerH, imgH, imgW, scale, orientation = 'vertical', totalRows = 0, boost = 1 } = args;
  if (containerH <= 0 || imgH <= 0 || imgW <= 0 || scale <= 0) return null;
  let targetPx = Math.min(INIT_RULER_PX_MAX, Math.max(INIT_RULER_PX_MIN, containerH / 18));
  if (totalRows > 1) {
    const rowPx = (imgH * scale) / totalRows;
    targetPx = Math.min(targetPx, Math.max(INIT_RULER_PX_FLOOR_DENSE, rowPx * 1.5));
  }
  targetPx *= boost;
  const refPx = (orientation === 'horizontal' ? imgW : imgH) * scale;
  return Math.min(LOG_RULER_MAX, Math.max(0.01, (targetPx / refPx) * 100));
}
const MIN_VIEW_RANGE = 1e-6; // effectively no lower limit on slider view window
const STEP_MULT_MIN = 0.25;  // ÷2 lower bound → 0.5 screen px per press
const STEP_MULT_MAX = 32;    // ×2 upper bound → 64 screen px per press

const DRAW_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#1e1e1e','#ffffff'];
const DRAW_TOOLS: { id: DrawTool; label: TranslationKey; icon: React.ReactNode }[] = [
  { id: 'select', label: 'draw.tool.select', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
    </svg>
  )},
  { id: 'pen', label: 'draw.tool.pen', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 14H9v-3z" />
    </svg>
  )},
  { id: 'line', label: 'draw.tool.line', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <line x1="5" y1="19" x2="19" y2="5" strokeLinecap="round" />
    </svg>
  )},
  { id: 'rect', label: 'draw.tool.rect', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
    </svg>
  )},
  { id: 'circle', label: 'draw.tool.circle', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  )},
  { id: 'eraser', label: 'draw.tool.eraser', icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 20H7L3 16l10-10 7 7-3.5 3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 17.5l3-3" />
    </svg>
  )},
];

const SHAPE_ICON: Record<string, ReactNode> = {
  line: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeLinecap="round">
      <line x1="3" y1="5" x2="21" y2="5" strokeWidth="2" />
      <line x1="3" y1="9" x2="21" y2="9" strokeWidth="2" />
      <line x1="3" y1="13" x2="21" y2="13" strokeWidth="2" />
    </svg>
  ),
  circle: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="6" />
    </svg>
  ),
  ellipse: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="8" rx="10" ry="4.5" />
    </svg>
  ),
  rect: (
    <svg className="w-6 h-4" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2.5" y="3.5" width="19" height="9" rx="1.5" />
    </svg>
  ),
};

function PatternViewerPage({ pattern, isFromCache }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const viewerRef = useRef<PatternViewerHandle>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { request: requestWakeLock, release: releaseWakeLock, isActive: wakeLockActive } = useWakeLock();
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

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
  const [activeSubId, setActiveSubId] = useState<string>(() => {
    const saved = pattern.progress?.active_sub_pattern_id as string | undefined;
    return saved && subPatterns.some((s) => s.id === saved) ? saved : (subPatterns[0]?.id || '');
  });

  const activeSub = subPatterns.find((s) => s.id === activeSubId) || subPatterns[0];

  // Rulers are stored in CONTENT coordinates (% of pattern, not screen).
  // Several rulers may exist per image; every ruler action targets the ACTIVE one.
  const rulerNameFor = useCallback((n: number) => t('ruler.defaultName').replace('{n}', String(n)), [t]);
  const initialRulersRef = useRef(buildRulers(img0, pattern.progress, pattern.type, rulerNameFor));
  const [rulers, setRulers] = useState<Ruler[]>(() => initialRulersRef.current.rulers);
  const [activeRulerId, setActiveRulerId] = useState<string>(() => initialRulersRef.current.activeId);
  // Mutable mirror so stable setters/callbacks always hit the current active ruler
  const activeRulerIdRef = useRef(activeRulerId);
  activeRulerIdRef.current = activeRulerId;
  const activeRuler: Ruler = rulers.find((r) => r.id === activeRulerId) ?? rulers[0];
  // Derived views of the active ruler — the rest of this component reads these names.
  const rulerY = activeRuler.position_y;
  const rulerHeight = activeRuler.height;
  const rulerX = activeRuler.position_x;
  const rulerDirection = activeRuler.direction;
  const rulerOrientation = activeRuler.orientation;
  const rulerRotation = activeRuler.rotation;
  // Field setters with the same signature as useState setters, scoped to the active ruler.
  const rulerSetters = useMemo(() => {
    const mk = <K extends keyof Ruler>(key: K) => (v: SetStateAction<Ruler[K]>) =>
      setRulers((prev) => prev.map((r) => r.id === activeRulerIdRef.current
        ? { ...r, [key]: typeof v === 'function' ? (v as (p: Ruler[K]) => Ruler[K])(r[key]) : v }
        : r));
    return {
      setRulerY: mk('position_y'),
      setRulerHeight: mk('height'),
      setRulerX: mk('position_x'),
      setRulerDirection: mk('direction'),
      setRulerOrientation: mk('orientation'),
      setRulerRotation: mk('rotation'),
    };
  }, []);
  const { setRulerY, setRulerHeight, setRulerX, setRulerDirection, setRulerOrientation, setRulerRotation } = rulerSetters;
  // true = skip screen-relative init (pattern has a saved value or is crochet-line type)
  const rulerHeightInitializedRef = useRef(initialRulersRef.current.hasSavedHeight);
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
  const [crochetRowHeight, setCrochetRowHeight] = useState<number | null>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { rowHeight?: number } | undefined;
    return saved?.rowHeight ?? null;
  });
  const [crochetRotation, setCrochetRotation] = useState<number>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { rotation?: number } | undefined;
    return saved?.rotation ?? 0;
  });
  // Per-motif (sub-pattern) ring state for crochet rounds. The active sub's data is the live
  // state above; other subs live in this map until they become active again.
  const crochetBySubRef = useRef<Record<string, CrochetRulerData>>(img0?.crochet_ruler_data_by_sub ?? {});
  // Cached PDF page ratios per image (skips the pre-parse on reopen)
  const [pdfPageRatios, setPdfPageRatios] = useState<number[] | undefined>(img0?.pdf_page_ratios);
  // Bumped to force the viewer to re-fetch after a load error
  const [reloadKey, setReloadKey] = useState(0);
  const [completedCrochetRings, setCompletedCrochetRings] = useState<CrochetRing[]>(() => {
    const saved = (img0?.crochet_ruler_data ?? pattern.progress?.crochet_ruler_data) as { cx?: number; cy?: number; completedRings?: (number | CrochetRing)[] } | undefined;
    const savedCx = saved?.cx ?? 50;
    const savedCy = saved?.cy ?? 50;
    return (saved?.completedRings ?? []).map(r => typeof r === 'number' ? { cx: savedCx, cy: savedCy, r } : r);
  });
  const [completedMarks, setCompletedMarks] = useState<CompletedMark[]>(
    img0?.completed_marks ?? (pattern.progress?.completed_marks as CompletedMark[]) ?? []
  );
  const [hasMarkSelection, setHasMarkSelection] = useState(false);
  const [isAdjustingRuler, setIsAdjustingRuler] = useState(false);

  // Drawing mode state
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showSaveErrorPopup, setShowSaveErrorPopup] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawTool>('pen');
  const [drawingColor, setDrawingColor] = useState('#ef4444');
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(4);
  const [drawingOpacity, setDrawingOpacity] = useState(100);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [drawingPaths, setDrawingPaths] = useState<DrawPath[]>(
    img0?.drawing_paths ?? []
  );

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
  const [imageLoadError, setImageLoadError] = useState(false);
  // Tracks previous image index so we can save its state before switching
  const prevFileIdxRef = useRef(0);
  // Reopen on the image that was open last time (state init always starts from image 0; the
  // regular switch effect then swaps the per-image state in).
  useEffect(() => {
    const saved = imageStatesRef.current.findIndex((st) => st?.last_active);
    if (saved > 0 && saved < allFiles.length) setActiveFileIdx(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Set by the image-switch effect; the auto-save effect (same commit) skips writing
  // imageStatesRef[newIdx] once, because perImageStateLatest still holds the OLD image.
  const skipSlotWriteRef = useRef(false);
  // Skip the very first auto-save on mount: the data was just loaded, so writing it
  // back only bumps updated_at (which can make another device discard its offline edits).
  const isFirstSaveRef = useRef(true);
  // Separate ref for useLayoutEffect (runs before useEffect and before onLoad)
  const prevFileIdxLayoutRef = useRef(0);
  // Set of image indices that have been visited (and thus have saved per-image state)
  const [visitedImageIndices, setVisitedImageIndices] = useState<Set<number>>(() => {
    const visited = new Set<number>([0]); // image 0 always considered visited
    imageStatesRef.current.forEach((s, i) => { if (s) visited.add(i); });
    return visited;
  });
  const [showRulerSettings, setShowRulerSettings] = useState(false);
  // ---- session conveniences (device-local prefs) ----
  const [showHelp, setShowHelp] = useState(false);
  const [followRuler, setFollowRuler] = useState<boolean>(() => getPref('followRuler'));
  const followRulerRef = useRef(followRuler); followRulerRef.current = followRuler;
  const toggleFollowRuler = useCallback(() => setFollowRuler((v) => { setPref('followRuler', !v); return !v; }), []);
  const [viewLocked, setViewLockedState] = useState<boolean>(() => getViewLocked(pattern.id));
  const toggleViewLock = useCallback(() => setViewLockedState((v) => { setViewLocked(pattern.id, !v); return !v; }), [pattern.id]);
  const [showStitchCounter, setShowStitchCounter] = useState<boolean>(() => { try { return localStorage.getItem('kis_stitch_counter') === '1'; } catch { return false; } });
  const toggleStitchCounter = useCallback(() => setShowStitchCounter((v) => { try { localStorage.setItem('kis_stitch_counter', v ? '0' : '1'); } catch { /* ignore */ } return !v; }), []);
  const [textSize, setTextSizeState] = useState<TextSize>(() => getPref('textSize'));
  const changeTextSize = useCallback((v: TextSize) => { setPref('textSize', v); applyTextSize(v); setTextSizeState(v); }, []);
  const [splitIdx, setSplitIdx] = useState<number | null>(null);
  const isLandscapePhone = useMediaQuery(LANDSCAPE_PHONE_QUERY);
  const [exporting, setExporting] = useState(false);
  const [sessionStats, setSessionStats] = useState(() => getSession(pattern.id));
  // Knitting time: count a minute whenever the tab stays visible for one.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') { addSession(pattern.id, { seconds: 60 }); setSessionStats(getSession(pattern.id)); }
    }, 60000);
    return () => clearInterval(id);
  }, [pattern.id]);
  const [showCrochetSettings, setShowCrochetSettings] = useState(false);
  const handleToggleRulerSettings = useCallback(() => setShowRulerSettings(v => !v), []);
  // The settings panel covers the top of the viewer; bring the ruler into the visible middle.
  useEffect(() => {
    if (!showRulerSettings) return;
    const raf = requestAnimationFrame(() => viewerRef.current?.goToRuler({ keepScale: true }));
    return () => cancelAnimationFrame(raf);
  }, [showRulerSettings]);
  const handleToggleCrochetSettings = useCallback(() => setShowCrochetSettings(v => !v), []);
  const [showOverlays, setShowOverlays] = useState(true);
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
  // Track last reported image dimensions so we can re-restore with the most accurate values
  const lastReportedImgH = useRef(0);
  const lastReportedImgW = useRef(0);
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
    if (w > 0) lastReportedImgW.current = w;
    // Immediately mutate latestRef so ruler calculations use fresh image dimensions
    latestRef.current.imgW = w;
    latestRef.current.imgH = h;
    setImgW(w);
    setImgH(h);
    if (!initialScrollDoneRef.current && h > 0) {
      initialScrollDoneRef.current = true;
      if (imageLoadingTimeoutRef.current) { clearTimeout(imageLoadingTimeoutRef.current); imageLoadingTimeoutRef.current = null; }
      setIsImageLoading(false);
      setImageLoadError(false);
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
            // 재방문: 저장된 뷰 위치가 있으면 복원, 없으면 진행선 중앙 정렬
            const savedState = imageStatesRef.current[activeFileIdxRef.current];
            if (savedState?.view_scale && h > 0) {
              // view_fit_scale이 저장된 경우: s = view_scale × (현재 fit-width / 저장 fit-width)
              // → 기기가 달라도 같은 상대적 줌 레벨로 복원.
              // 구버전 데이터(view_fit_scale 없음): 절대값 그대로 사용 (기존 동작 유지).
              const cW = latestRef.current.containerW;
              const cH = latestRef.current.containerH;
              const currentFitW = cW > 0 && w > 0 ? cW / w : 0;
              const s = currentFitW > 0 && savedState.view_fit_scale
                ? savedState.view_scale * (currentFitW / savedState.view_fit_scale)
                : savedState.view_scale;
              const cx = savedState.view_x ?? 50;
              const cy = savedState.view_y ?? 50;
              const tx = w > 0 ? -(cx / 100 * w - w / 2) * s : 0;
              const rawTy = -(cy / 100 * h - h / 2) * s;
              const maxTy = cH > 0 ? Math.max(0, (h * s - cH) / 2) : 0;
              const ty = Math.max(-maxTy, Math.min(maxTy, rawTy));
              viewerRef.current?.restoreTransform(s, tx, ty);
            } else {
              // 저장된 뷰 없음: fit-width 배율로 진행선 중앙 정렬
              viewerRef.current?.fitWidthGoToRuler();
            }
          }
        });
      });
    } else if (
      h > 0 &&
      Math.abs(h - prevH) > 50 &&
      !isFirstOpenRef.current &&
      !showGuideRef.current
    ) {
      // imgH changed significantly (>50px) — PDF 다중 페이지에서 최종 높이가 확정되는 시점.
      // 저장된 뷰가 있으면 최신 w/h로 재복원, 없으면 진행선 중앙 정렬.
      // Debounce 300ms to collapse rapid sequential ResizeObserver/render events.
      if (goToRulerCorrectionTimerRef.current) clearTimeout(goToRulerCorrectionTimerRef.current);
      goToRulerCorrectionTimerRef.current = setTimeout(() => {
        requestAnimationFrame(() => {
          const latestW = lastReportedImgW.current;
          const latestH = lastReportedImgH.current;
          const savedState = imageStatesRef.current[activeFileIdxRef.current];
          if (savedState?.view_scale && latestW > 0 && latestH > 0) {
            const cW = latestRef.current.containerW;
            const cH = latestRef.current.containerH;
            const currentFitW = cW > 0 && latestW > 0 ? cW / latestW : 0;
            const s = currentFitW > 0 && savedState.view_fit_scale
              ? savedState.view_scale * (currentFitW / savedState.view_fit_scale)
              : savedState.view_scale;
            const cx = savedState.view_x ?? 50;
            const cy = savedState.view_y ?? 50;
            const tx = -(cx / 100 * latestW - latestW / 2) * s;
            const rawTy = -(cy / 100 * latestH - latestH / 2) * s;
            const maxTy = cH > 0 ? Math.max(0, (latestH * s - cH) / 2) : 0;
            const ty = Math.max(-maxTy, Math.min(maxTy, rawTy));
            viewerRef.current?.restoreTransform(s, tx, ty);
          } else {
            viewerRef.current?.fitWidthGoToRuler();
          }
        });
      }, 300);
    }
  }, []);

  // Ref for stable callbacks that need latest transform/ruler values.
  // Updated directly in render (not via useEffect) so it is always current
  // before any pointer event fires — even in the same frame as a state change.
  const latestRef = useRef({ rulerY, rulerHeight, rulerX, rulerOrientation, rulerDirection, rulers, activeRulerId, subPatterns, activeSubId, viewTransform, containerH, containerW, imgH, imgW, crochetR, crochetRy, crochetCx, crochetCy, crochetShape, completedCrochetRings, crochetRowHeight, crochetRotation, notesMap: {} as Record<string, string> });
  latestRef.current = { rulerY, rulerHeight, rulerX, rulerOrientation, rulerDirection, rulers, activeRulerId, subPatterns, activeSubId, viewTransform, containerH, containerW, imgH, imgW, crochetR, crochetRy, crochetCx, crochetCy, crochetShape, completedCrochetRings, crochetRowHeight, crochetRotation, notesMap: latestRef.current.notesMap };

  // containerH starts as a 600px placeholder; never derive the initial ruler height from it.
  const containerMeasuredRef = useRef(false);
  const handleTransformChange = useCallback(
    (t: { scale: number; x: number; y: number }, H: number, W: number) => {
      // Immediately mutate latestRef so handleRulerPositionChange reads fresh values
      // even before React re-renders (eliminates stale-scale cross-device mismatch)
      latestRef.current.viewTransform = t;
      latestRef.current.containerH = H;
      latestRef.current.containerW = W;
      if (H > 0 && W > 0) containerMeasuredRef.current = true;
      setViewTransform(t);
      setContainerH(H);
      setContainerW(W);
    },
    []
  );

  // One-shot per image: migrate legacy drawing paths (no widthPct) to image-relative % width.
  // widthPct makes stroke width device-independent. Fires when imgW is first known per image.
  const pathMigrationDoneRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (imgW <= 0) return;
    const idx = activeFileIdxRef.current;
    if (pathMigrationDoneRef.current.has(idx)) return;
    pathMigrationDoneRef.current.add(idx);
    setDrawingPaths(prev => {
      if (prev.every(p => p.widthPct != null)) return prev;
      return prev.map(p => p.widthPct != null ? p : { ...p, widthPct: p.width / imgW * 100 });
    });
  }, [imgW]);

  // Per image: give the ruler a screen-based default height when there is no saved value.
  // Skipped if a saved ruler_height exists (rulerHeightInitializedRef starts true in that case).
  // PDFs report a growing total height while pages parse, so as long as the user has not
  // touched the auto value we recompute when the image height changes noticeably.
  const autoInitRef = useRef<{ imgH: number; height: number } | null>(null);
  useEffect(() => {
    if (imgH <= 0 || imgW <= 0 || containerH <= 0 || containerW <= 0) return;
    if (!containerMeasuredRef.current) return;
    const auto = autoInitRef.current;
    if (rulerHeightInitializedRef.current) {
      const untouched = !!auto && Math.abs(latestRef.current.rulerHeight - auto.height) < 1e-9;
      const drifted = !!auto && Math.abs(imgH - auto.imgH) / auto.imgH > 0.05;
      if (!(untouched && drifted)) return;
    }
    const { subPatterns: subs, activeSubId: asid, rulerOrientation: orientation } = latestRef.current;
    const sub = subs.find((s) => s.id === asid);
    const totalRows = (sub?.total_rows ?? 0) > 1 ? sub!.total_rows : (pattern.total_rows > 1 ? pattern.total_rows : 0);
    const fitScale = Math.min(10, Math.max(0.5, containerW / imgW));
    const newH = defaultRulerHeightPct({ containerH, imgH, imgW, scale: fitScale, orientation, totalRows });
    if (newH == null) return;
    setRulerHeight(newH);
    latestRef.current.rulerHeight = newH;
    setSliderViewMax(Math.min(LOG_RULER_MAX, Math.max(MIN_VIEW_RANGE * 2, newH * 4)));
    rulerHeightInitializedRef.current = true;
    autoInitRef.current = { imgH, height: newH };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgH, imgW, containerH, containerW]);

  // Undo/Redo history
  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const undoStateRef = useRef<Snapshot>({
    subPatterns,
    activeSubId,
    rulers,
    activeRulerId,
    completedMarks,
    crochetMarks: [],
    knittingMarks: [],
    crochetCx,
    crochetCy,
    crochetR,
    crochetRy,
    crochetRowHeight,
    crochetRotation,
    completedCrochetRings,
    drawingPaths,
    notes: {},
    notePositions: {},
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
    setRulers(snap.rulers);
    setActiveRulerId(snap.activeRulerId);
    activeRulerIdRef.current = snap.activeRulerId;
    setCompletedMarks(snap.completedMarks);
    setCrochetMarks(snap.crochetMarks);
    setKnittingMarks(snap.knittingMarks);
    setCrochetCx(snap.crochetCx);
    setCrochetCy(snap.crochetCy);
    setCrochetR(snap.crochetR);
    setCrochetRy(snap.crochetRy);
    setCrochetRowHeight(snap.crochetRowHeight);
    setCrochetRotation(snap.crochetRotation);
    setCompletedCrochetRings(snap.completedCrochetRings);
    setDrawingPaths(snap.drawingPaths);
    setSelectedPathId(null);
    setNotes(snap.notes);
    setNotePositions(snap.notePositions);
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
      if (isTextInputTarget(e.target)) return; // let the field handle its own undo/redo
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTextInputTarget(e.target)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPathId && isDrawingMode && drawingTool === 'select') {
        e.preventDefault();
        captureHistory();
        setDrawingPaths(prev => prev.filter(p => p.id !== selectedPathId));
        setSelectedPathId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedPathId, isDrawingMode, drawingTool, captureHistory]);

  useEffect(() => {
    if (!isDrawingMode) setSelectedPathId(null);
  }, [isDrawingMode]);


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
    const { rulerOrientation: o, rulerDirection: d, rulerHeight: rh, imgH: iH, imgW: iW } = latestRef.current;

    // Convert rulerHeight to preserve the same visual screen size after rotation.
    // vertical rulerHeight is % of imgH; horizontal rulerHeight is % of imgW.
    // screen_px = (h/100) * imgH * scale  (vertical)
    // screen_px = (h/100) * imgW * scale  (horizontal)
    // Preserving screen_px: newH = h * imgH/imgW  (vertical→horizontal)
    let newRulerHeight = rh;
    if (iH > 0 && iW > 0) {
      const factor = o === 'vertical' ? iH / iW : iW / iH;
      newRulerHeight = rh * factor;
    }
    setRulerHeight(Math.max(0, Math.min(LOG_RULER_MAX, newRulerHeight)));

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
      setRulerHeight(Math.min(LOG_RULER_MAX, Math.max(0, (contentW_px / refW) * 100)));
    } else {
      const contentH_px = (screenHPct / 100) * H / t.scale;
      const refH = iH > 0 ? iH : H;
      setRulerHeight(Math.min(LOG_RULER_MAX, Math.max(0, (contentH_px / refH) * 100)));
    }
    setShowGuide(false);
  }, []);

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

  const handleCrochetRowHeightChange = useCallback((screenHPct: number) => {
    const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
    const refH = iH > 0 ? iH : H;
    setCrochetRowHeight(Math.max(0.01, (screenHPct / 100) * H / t.scale / refH * 100));
  }, []);

  const handleCrochetShapeChange = useCallback((newShape: 'line' | 'circle' | 'ellipse' | 'rect') => {
    const { imgW: iW, imgH: iH, crochetShape: prevShape, crochetR: prevR, rulerHeight: prevRulerH } = latestRef.current;
    captureHistory();
    const prevIs2D = prevShape === 'ellipse' || prevShape === 'rect';
    const newIs2D = newShape === 'ellipse' || newShape === 'rect';
    if (newShape === 'line') {
      setShowCrochetSettings(false);
      setShowRulerSettings(false);
      if (prevRulerH <= 0.3) { setRulerHeight(10); }
    } else if (prevShape === 'line') {
      setShowRulerSettings(false);
      const baseR = prevR < 1 ? 20 : prevR;
      if (prevR < 1) setCrochetR(baseR);
      if (newIs2D) { setCrochetRy(iW > 0 && iH > 0 ? baseR * iW / iH : baseR); }
      if (prevRulerH <= 0.3) { setRulerHeight(10); }
    } else if (!prevIs2D && newIs2D) {
      setCrochetRy(iW > 0 && iH > 0 ? prevR * iW / iH : prevR);
    }
    setCrochetShape(newShape);
  }, [captureHistory]);

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

  // Keep undoStateRef in sync — direct assignment avoids scheduling an effect on every drag frame
  undoStateRef.current = { subPatterns, activeSubId, rulers, activeRulerId, completedMarks, crochetMarks, knittingMarks, crochetCx, crochetCy, crochetR, crochetRy, crochetRowHeight, crochetRotation, completedCrochetRings, drawingPaths, notes: {}, notePositions: {} };

  const [notes, setNotes] = useState<Record<string, string>>(
    img0?.notes ?? (pattern.progress?.notes as Record<string, string>) ?? {}
  );
  const [notePositions, setNotePositions] = useState<Record<string, NotePosition>>(
    img0?.note_positions ?? (pattern.progress?.note_positions as Record<string, NotePosition>) ?? {}
  );
  // Notes are declared after undoStateRef; complete the snapshot here (same render pass).
  undoStateRef.current.notes = notes;
  undoStateRef.current.notePositions = notePositions;
  const notesCountRef = useRef(0);
  notesCountRef.current = Object.keys(notes).length;
  latestRef.current.notesMap = notes;
  // Ruler height step: base unit is ~2 screen px per button press, scaled by stepMultiplier (÷2 / ×2 buttons).
  // rulerHeight is % of imgH for vertical rulers and % of imgW for horizontal ones.
  const [stepMultiplier, setStepMultiplier] = useState(1);
  const baseStep = useMemo(() => {
    const dim = rulerOrientation === 'horizontal' ? imgW : imgH;
    return dim > 0 && viewTransform.scale > 0 ? 2 / (dim * viewTransform.scale) * 100 : 0.1;
  }, [imgW, imgH, rulerOrientation, viewTransform.scale]);
  const rulerStep = baseStep * stepMultiplier;
  const rulerStepPx = 2 * stepMultiplier; // screen px per press, for display
  const rulerStepRef = useRef(rulerStep);
  rulerStepRef.current = rulerStep;

  // Slider view window — defines the linear range the slider covers.
  const [sliderViewMin, setSliderViewMin] = useState(0);
  const [sliderViewMax, setSliderViewMax] = useState(() => {
    const init = initialRulersRef.current;
    const rh = init.rulers.find((r) => r.id === init.activeId)?.height ?? 5;
    return Math.min(LOG_RULER_MAX, Math.max(MIN_VIEW_RANGE * 2, rh * 4));
  });

  // Latest slider window for use inside hold-repeat callbacks (which outlive a single render).
  const sliderViewRef = useRef({ min: 0, max: 0 });
  sliderViewRef.current = { min: sliderViewMin, max: sliderViewMax };

  // Always-current snapshot of all per-image state (updated in render, like latestRef).
  // Used to save the current image's state before switching to another image.
  const perImageStateLatest = useRef<ImagePerState>({});
  const ruler0 = rulers[0];
  perImageStateLatest.current = {
    rulers,
    active_ruler_id: activeRulerId,
    // Legacy mirror of ruler 1 for older clients
    ruler_position_y: ruler0.position_y,
    ruler_height: ruler0.height,
    ruler_position_x: ruler0.position_x,
    ruler_direction: ruler0.direction,
    ruler_orientation: ruler0.orientation,
    ruler_rotation: ruler0.rotation || undefined,
    active_sub_id: activeSubId,
    last_active: true,
    completed_marks: completedMarks,
    knitting_marks: knittingMarks,
    crochet_marks: crochetMarks,
    crochet_ruler_data: { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings },
    crochet_ruler_data_by_sub: isCrochet
      ? { ...crochetBySubRef.current, [activeSubId]: { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings } }
      : undefined,
    pdf_page_ratios: pdfPageRatios,
    notes,
    note_positions: notePositions,
    // Save view as image-relative % so it restores correctly on any screen size.
    // imgW/imgH are 0 before the image loads (first render / image switch).
    // Fall back to the last known saved state so auto-save on mount does NOT
    // overwrite a previously correct view_scale with the default scale=1.
    // view_scale: absolute CSS scale (device-dependent).
    // view_fit_scale: fit-width scale (containerW/imgW) at save time.
    // Restore: s = view_scale × (current_fitW / saved_fitW) → same relative zoom on any device.
    view_scale: imgW > 0 && imgH > 0
      ? viewTransform.scale
      : imageStatesRef.current[activeFileIdx]?.view_scale,
    view_fit_scale: imgW > 0 && containerW > 0
      ? containerW / imgW
      : imageStatesRef.current[activeFileIdx]?.view_fit_scale,
    view_x: imgW > 0
      ? (0.5 - viewTransform.x / (viewTransform.scale * imgW)) * 100
      : imageStatesRef.current[activeFileIdx]?.view_x,
    view_y: imgH > 0
      ? (0.5 - viewTransform.y / (viewTransform.scale * imgH)) * 100
      : imageStatesRef.current[activeFileIdx]?.view_y,
    drawing_paths: drawingPaths,
  };

  const updateActiveSub = useCallback((updater: (sub: SubPattern) => SubPattern) => {
    setSubPatterns((prev) =>
      prev.map((s) => (s.id === activeSubId ? updater(s) : s))
    );
  }, [activeSubId]);

  // Runs synchronously after DOM commit (before browser can fire onLoad for the new image).
  // Cached images may dispatch onLoad before the passive useEffect below, so we reset
  // the critical refs here to guarantee handleImageSize sees the correct values.
  useLayoutEffect(() => {
    if (prevFileIdxLayoutRef.current === activeFileIdx) return;
    prevFileIdxLayoutRef.current = activeFileIdx;
    initialScrollDoneRef.current = false;
    lastReportedImgH.current = 0;
    lastReportedImgW.current = 0;
    isFirstOpenRef.current = !imageStatesRef.current[activeFileIdx];
    if (goToRulerCorrectionTimerRef.current) {
      clearTimeout(goToRulerCorrectionTimerRef.current);
      goToRulerCorrectionTimerRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileIdx]);

  // When the user switches to a different image:
  // 1. Save current image's per-image state into imageStatesRef
  // 2. Restore the target image's saved state (or defaults for first visit)
  useEffect(() => {
    if (prevFileIdxRef.current === activeFileIdx) return;
    const prevIdx = prevFileIdxRef.current;
    prevFileIdxRef.current = activeFileIdx;

    // Reset image dimensions so perImageStateLatest doesn't capture stale values
    // from the previous image before the new one reports its size
    setImgW(0);
    setImgH(0);

    // Show loading overlay while new image loads
    setIsImageLoading(true);
    setImageLoadError(false);
    // Safety: clear overlay after 8s in case image never reports dimensions (e.g., load error)
    if (imageLoadingTimeoutRef.current) clearTimeout(imageLoadingTimeoutRef.current);
    imageLoadingTimeoutRef.current = setTimeout(() => {
      setIsImageLoading(false);
      setImageLoadError(true);
    }, 8000);

    // Save current state for the image we're leaving (deep copy to prevent shared array refs)
    imageStatesRef.current[prevIdx] = structuredClone(perImageStateLatest.current);
    for (let i = 0; i < imageStatesRef.current.length; i++) {
      const slot = imageStatesRef.current[i];
      if (slot && slot.last_active && i !== activeFileIdx) slot.last_active = false;
    }
    skipSlotWriteRef.current = true;
    // Mark both images as visited
    setVisitedImageIndices(prev => new Set([...prev, prevIdx, activeFileIdx]));

    // Load state for the image we're switching to
    const next = imageStatesRef.current[activeFileIdx];

    const nextCrochetShape = ((next?.crochet_ruler_data?.shape ?? 'circle') as 'line' | 'circle' | 'ellipse' | 'rect');
    const built = buildRulers(next, undefined, pattern.type, rulerNameFor);
    setRulers(built.rulers);
    setActiveRulerId(built.activeId);
    activeRulerIdRef.current = built.activeId;
    const restoredRh = built.rulers.find((r) => r.id === built.activeId)?.height ?? 5;
    setSliderViewMin(0);
    setSliderViewMax(Math.min(LOG_RULER_MAX, Math.max(MIN_VIEW_RANGE * 2, restoredRh * 4)));
    // no saved value → useEffect applies the screen-based default after the new image loads
    rulerHeightInitializedRef.current = built.hasSavedHeight;
    autoInitRef.current = null;
    setCompletedMarks(next?.completed_marks ?? []);
    setKnittingMarks(next?.knitting_marks ?? []);
    setCrochetMarks(next?.crochet_marks ?? []);

    const crd = next?.crochet_ruler_data;
    setCrochetShape(nextCrochetShape);
    setCrochetCx(crd?.cx ?? 50);
    setCrochetCy(crd?.cy ?? 50);
    setCrochetR(crd?.r ?? 3);
    setCrochetRy(crd?.ry ?? crd?.r ?? 3);
    setCrochetRowHeight(crd?.rowHeight ?? null);
    setCrochetRotation(crd?.rotation ?? 0);
    const crdCx = crd?.cx ?? 50;
    const crdCy = crd?.cy ?? 50;
    setCompletedCrochetRings(
      (crd?.completedRings ?? []).map(r =>
        typeof r === 'number'
          ? { cx: crdCx, cy: crdCy, r }
          : { ...r, shape: r.shape as 'circle' | 'ellipse' | 'rect' | undefined }
      )
    );
    setPdfPageRatios(next?.pdf_page_ratios);
    setReloadKey(0);

    // A sub-pattern deleted after this slot was saved must not become the active one.
    const nextSubId = next?.active_sub_id && latestRef.current.subPatterns.some((s) => s.id === next.active_sub_id)
      ? next.active_sub_id : latestRef.current.activeSubId;
    if (nextSubId !== latestRef.current.activeSubId) setActiveSubId(nextSubId);
    // Per-motif rings: this image's map; the active sub's entry wins over the legacy single state.
    crochetBySubRef.current = { ...(next?.crochet_ruler_data_by_sub ?? {}) };
    crochetPrevSubRef.current = nextSubId; // the sub-change effect must not treat this switch as a motif change
    const mine = crochetBySubRef.current[nextSubId];
    if (mine) applyCrochetData(mine);

    setNotes(next?.notes ?? {});
    setNotePositions(next?.note_positions ?? {});
    setDrawingPaths(next?.drawing_paths ?? []);
    setSelectedPathId(null);

    // Reset undo/redo history for the new image
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);

    // isFirstOpenRef / initialScrollDoneRef are already reset in the useLayoutEffect above.
    // Guides only show on image 0 — close them when switching to any other image
    if (activeFileIdx !== 0) {
      setShowSubPatternGuide(false);
      setShowCrochetShapeGuide(false);
      setShowGuide(false);
      setShowRulerGuide(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFileIdx]);

  const applyCrochetData = useCallback((d: CrochetRulerData) => {
    if (d.cx != null) setCrochetCx(d.cx);
    if (d.cy != null) setCrochetCy(d.cy);
    if (d.r != null) setCrochetR(d.r);
    setCrochetRy(d.ry ?? d.r ?? 3);
    setCrochetRowHeight(d.rowHeight ?? null);
    setCrochetRotation(d.rotation ?? 0);
    const cx0 = d.cx ?? 50, cy0 = d.cy ?? 50;
    setCompletedCrochetRings((d.completedRings ?? []).map((r) =>
      typeof r === 'number' ? { cx: cx0, cy: cy0, r } : { ...r, shape: r.shape as 'circle' | 'ellipse' | 'rect' | undefined }
    ));
  }, []);
  const snapshotCrochetData = useCallback((): CrochetRulerData => {
    const l = latestRef.current;
    return { shape: l.crochetShape, cx: l.crochetCx, cy: l.crochetCy, r: l.crochetR, ry: l.crochetRy, rowHeight: l.crochetRowHeight ?? undefined, rotation: l.crochetRotation || undefined, completedRings: l.completedCrochetRings };
  }, []);
  // Switching motif (sub-pattern) in crochet round mode swaps the ring set; geometry carries over
  // to a motif that has no rings yet.
  const crochetPrevSubRef = useRef<string>(activeSubId);
  useEffect(() => {
    const prev = crochetPrevSubRef.current;
    if (prev === activeSubId) return;
    crochetPrevSubRef.current = activeSubId;
    if (!isCrochet || crochetShape === 'line') return;
    crochetBySubRef.current[prev] = snapshotCrochetData();
    const mine = crochetBySubRef.current[activeSubId];
    if (mine) applyCrochetData(mine);
    else setCompletedCrochetRings([]);
  }, [activeSubId, isCrochet, crochetShape, snapshotCrochetData, applyCrochetData]);

  // Motif flow: finishing the last round of a motif offers "start next motif".
  const [motifToast, setMotifToast] = useState<{ n: number; total: number } | null>(null);
  const completePressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeLongPressedRef = useRef(false);
  useEffect(() => () => { if (completePressTimerRef.current) clearTimeout(completePressTimerRef.current); }, []);
  useEffect(() => {
    if (!motifToast) return;
    const id = setTimeout(() => setMotifToast(null), 12000);
    return () => clearTimeout(id);
  }, [motifToast]);
  const handleNextMotif = useCallback(() => {
    captureHistory();
    updateActiveSub((su) => ({ ...su, motif_count: Math.min(su.motif_target ?? 0, (su.motif_count ?? 0) + 1), current_row: 0, stitch_count: su.stitch_reset_on_row ? 0 : su.stitch_count }));
    setCompletedCrochetRings([]);
    setMotifToast(null);
  }, [captureHistory, updateActiveSub]);

  // Half round (long-press on Complete in round mode): records a 180° band at the current size
  // without advancing the row; the next Complete turns it into a full round.
  const handleCrochetHalfRound = useCallback(() => {
    const { crochetR: cr, crochetRy: cry, crochetCx: cx, crochetCy: cy, completedCrochetRings: rings, crochetShape: shape, containerW: W, containerH: H, imgW: iW, imgH: iH, crochetRowHeight: rowH } = latestRef.current;
    if (shape === 'rect') return;
    const last = rings.length > 0 ? rings[rings.length - 1] : null;
    if (last?.sweep) return; // already a half round pending
    captureHistory();
    const is2D = shape === 'ellipse';
    const lastRy = last ? (last.ry ?? last.r) : 0;
    const lastR = last ? last.r : 0;
    const stepRy = rowH ?? Math.max(cry - lastRy, cry * 0.3);
    const refW = iW > 0 ? iW : W;
    const refH = iH > 0 ? iH : H;
    const stepR = (is2D || rowH != null) && refW > 0 && refH > 0 ? (stepRy / 100) * refH / refW * 100 : Math.max(cr - lastR, cr * 0.3);
    setCompletedCrochetRings((prev) => [...prev, {
      cx, cy, r: cr, rInner: Math.max(0, cr - stepR),
      ry: is2D ? cry : undefined, ryInner: is2D ? Math.max(0, cry - stepRy) : undefined,
      shape: shape === 'circle' ? undefined : (shape as 'ellipse' | 'rect'),
      sweep: { start: 0, end: 180 },
    }]);
  }, [captureHistory]);

  const handleCrochetCircleComplete = useCallback(() => {
    captureHistory();
    const { crochetR: cr, crochetRy: cry, crochetCx: cx, crochetCy: cy, completedCrochetRings: rings, crochetShape: shape, containerW: W, containerH: H, imgW: iW, imgH: iH, crochetRowHeight: rowH } = latestRef.current;
    const is2D = shape === 'ellipse' || shape === 'rect';
    // A pending half round becomes the full round instead of adding a second band.
    const pendingHalf = rings.length > 0 && !!rings[rings.length - 1].sweep;
    const fullRings = pendingHalf ? rings.slice(0, -1) : rings;
    const lastRing = fullRings.length > 0 ? fullRings[fullRings.length - 1] : null;
    const lastRy = lastRing ? (lastRing.ry ?? lastRing.r) : 0;
    const lastR = lastRing ? lastRing.r : 0;
    // rowH is image-relative % of imgH; convert to image-relative % of imgW for rx step
    const stepRy = rowH ?? Math.max(cry - lastRy, cry * 0.3);
    const refW = iW > 0 ? iW : W;
    const refH = iH > 0 ? iH : H;
    const stepR = (is2D || rowH != null) && refW > 0 && refH > 0
      ? (stepRy / 100) * refH / refW * 100
      : Math.max(cr - lastR, cr * 0.3);
    setCompletedCrochetRings(prev => {
      const base = (prev.length > 0 && prev[prev.length - 1].sweep) ? prev.slice(0, -1) : prev;
      return [...base, {
        cx, cy,
        r: cr,
        rInner: Math.max(0, cr - stepR),
        ry: is2D ? cry : undefined,
        ryInner: is2D ? Math.max(0, cry - stepRy) : undefined,
        shape: shape === 'circle' ? undefined : shape as 'ellipse' | 'rect',
      }];
    });
    {
      const sub = latestRef.current.subPatterns.find((x) => x.id === latestRef.current.activeSubId);
      if (sub && (sub.motif_target ?? 0) > 0 && (sub.motif_count ?? 0) < (sub.motif_target ?? 0) && sub.current_row + 1 >= sub.total_rows) {
        setMotifToast({ n: (sub.motif_count ?? 0) + 1, total: sub.motif_target ?? 0 });
      }
    }
    setCrochetR(cr + stepR);
    if (is2D) setCrochetRy(cry + stepRy);
    else if (rowH != null) setCrochetRy(cry + stepRy);
    updateActiveSub(s => ({ ...s, current_row: s.current_row + 1, ...(s.stitch_reset_on_row ? { stitch_count: 0 } : {}) }));
    addSession(pattern.id, { rows: 1 }); setSessionStats(getSession(pattern.id));
    // Follow: keep the growing ring inside the viewport
    if (followRulerRef.current) {
      const t = latestRef.current.viewTransform;
      const refH2 = iH > 0 ? iH : H;
      const topPx = (iH > 0 ? (H - iH) / 2 : 0) + ((cy - (cry + stepRy)) / 100) * refH2;
      const botPx = (iH > 0 ? (H - iH) / 2 : 0) + ((cy + (cry + stepRy)) / 100) * refH2;
      const sTop = (topPx - H / 2) * t.scale + H / 2 + t.y;
      const sBot = (botPx - H / 2) * t.scale + H / 2 + t.y;
      if (sTop < 0 || sBot > H) requestAnimationFrame(() => viewerRef.current?.goToRuler({ keepScale: true }));
    }
  }, [captureHistory, updateActiveSub, pattern.id]);

  const userIdRef = useRef<string | null>(null);

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

      // Offline — or earlier offline edits still waiting to be replayed — queue locally
      // (optimistic). Writing directly while the queue is non-empty would let the stale
      // queued payload overwrite this newer one when the replay runs.
      if (!isOnlineRef.current || hasOfflineQueue()) {
        const queued = enqueueOfflineUpdate({ patternId: pattern.id, userId: uid, data, queuedAt: Date.now() });
        if (!queued) throw new Error('storage_full');
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
          const queued = enqueueOfflineUpdate({ patternId: pattern.id, userId: uid, data, queuedAt: Date.now() });
          if (!queued) throw new Error('storage_full');
          return;
        }
        throw new Error(error.message);
      }
    },
    [supabase, pattern.id]
  );

  const { save, status } = useAutoSave(saveFn);

  useEffect(() => {
    if (status === 'error') setShowSaveErrorPopup(true);
  }, [status]);

  useEffect(() => {
    // Keep imageStatesRef in sync with current image state before saving
    if (skipSlotWriteRef.current) {
      skipSlotWriteRef.current = false; // this render still reflects the previous image
    } else {
      imageStatesRef.current[activeFileIdx] = structuredClone(perImageStateLatest.current);
    }
    if (isFirstSaveRef.current) {
      isFirstSaveRef.current = false;
      return;
    }
    save({
      current_row: activeSub?.current_row || 0,
      // Keep top-level columns for backward compat (image 0 values)
      ruler_position_y: activeFileIdx === 0 ? ruler0.position_y : (imageStatesRef.current[0]?.ruler_position_y ?? ruler0.position_y),
      ruler_height: activeFileIdx === 0 ? ruler0.height : (imageStatesRef.current[0]?.ruler_height ?? ruler0.height),
      ruler_direction: activeFileIdx === 0 ? ruler0.direction : (imageStatesRef.current[0]?.ruler_direction ?? ruler0.direction),
      ruler_orientation: activeFileIdx === 0 ? ruler0.orientation : (imageStatesRef.current[0]?.ruler_orientation ?? ruler0.orientation),
      ruler_position_x: activeFileIdx === 0 ? ruler0.position_x : (imageStatesRef.current[0]?.ruler_position_x ?? ruler0.position_x),
      completed_marks: activeFileIdx === 0 ? completedMarks : (imageStatesRef.current[0]?.completed_marks ?? completedMarks),
      crochet_marks: activeFileIdx === 0 ? crochetMarks : (imageStatesRef.current[0]?.crochet_marks ?? crochetMarks),
      knitting_marks: activeFileIdx === 0 ? knittingMarks : (imageStatesRef.current[0]?.knitting_marks ?? knittingMarks),
      notes: activeFileIdx === 0 ? notes : (imageStatesRef.current[0]?.notes ?? notes),
      note_positions: activeFileIdx === 0 ? notePositions : (imageStatesRef.current[0]?.note_positions ?? notePositions),
      crochet_ruler_data: activeFileIdx === 0
        ? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings }
        : (imageStatesRef.current[0]?.crochet_ruler_data ?? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings }),
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
      image_states: imageStatesRef.current,
    });
  }, [activeSub, activeFileIdx, rulers, activeRulerId, completedMarks, crochetMarks, knittingMarks, notes, notePositions, subPatterns, activeSubId, crochetShape, crochetCx, crochetCy, crochetR, crochetRy, crochetRowHeight, crochetRotation, completedCrochetRings, drawingPaths, save]);

  // Save all state immediately (used by save view button and back button)
  const saveAll = useCallback(() => {
    // Ensure current image state is flushed to imageStatesRef before saving
    imageStatesRef.current[activeFileIdx] = structuredClone(perImageStateLatest.current);
    return saveFn({
      current_row: activeSub?.current_row || 0,
      ruler_position_y: activeFileIdx === 0 ? ruler0.position_y : (imageStatesRef.current[0]?.ruler_position_y ?? ruler0.position_y),
      ruler_height: activeFileIdx === 0 ? ruler0.height : (imageStatesRef.current[0]?.ruler_height ?? ruler0.height),
      ruler_direction: activeFileIdx === 0 ? ruler0.direction : (imageStatesRef.current[0]?.ruler_direction ?? ruler0.direction),
      ruler_orientation: activeFileIdx === 0 ? ruler0.orientation : (imageStatesRef.current[0]?.ruler_orientation ?? ruler0.orientation),
      ruler_position_x: activeFileIdx === 0 ? ruler0.position_x : (imageStatesRef.current[0]?.ruler_position_x ?? ruler0.position_x),
      completed_marks: activeFileIdx === 0 ? completedMarks : (imageStatesRef.current[0]?.completed_marks ?? completedMarks),
      crochet_marks: activeFileIdx === 0 ? crochetMarks : (imageStatesRef.current[0]?.crochet_marks ?? crochetMarks),
      knitting_marks: activeFileIdx === 0 ? knittingMarks : (imageStatesRef.current[0]?.knitting_marks ?? knittingMarks),
      notes: activeFileIdx === 0 ? notes : (imageStatesRef.current[0]?.notes ?? notes),
      note_positions: activeFileIdx === 0 ? notePositions : (imageStatesRef.current[0]?.note_positions ?? notePositions),
      crochet_ruler_data: activeFileIdx === 0
        ? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings }
        : (imageStatesRef.current[0]?.crochet_ruler_data ?? { shape: crochetShape, cx: crochetCx, cy: crochetCy, r: crochetR, ry: crochetRy, rowHeight: crochetRowHeight ?? undefined, rotation: crochetRotation || undefined, completedRings: completedCrochetRings }),
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
      image_states: imageStatesRef.current,
    });
  }, [saveFn, activeFileIdx, activeSub, rulers, activeRulerId, completedMarks, crochetMarks, knittingMarks, notes, notePositions, subPatterns, activeSubId, crochetShape, crochetCx, crochetCy, crochetR, crochetRy, crochetRowHeight, crochetRotation, completedCrochetRings]);

  // Flush save when page is hidden (tab switch, home button, device lock, iOS swipe).
  // This is a second line of defence alongside the unmount flush in useAutoSave.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') {
        imageStatesRef.current[activeFileIdxRef.current] = structuredClone(perImageStateLatest.current);
        saveAll().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [saveAll]);

  // Explicit "save view" button
  const [saveViewStatus, setSaveViewStatus] = useState<'idle' | 'saving' | 'done'>('idle');
  const [isSavingBack, setIsSavingBack] = useState(false);
  const saveViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current); }, []);

  const handleSaveView = useCallback(async () => {
    setSaveViewStatus('saving');
    try {
      await saveAll();
    } catch {
      setSaveViewStatus('idle');
      setShowSaveErrorPopup(true);
      return;
    }
    setSaveViewStatus('done');
    if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current);
    saveViewTimerRef.current = setTimeout(() => setSaveViewStatus('idle'), 2000);
  }, [saveAll]);

  const handleRowChange = (row: number) => {
    captureHistory();
    updateActiveSub((s) => ({ ...s, current_row: row }));
  };

  const handleNotesUpdate = useCallback(
    (updatedNotes: Record<string, string>) => {
      // Removing notes (clear current / clear all) is undoable
      if (Object.keys(updatedNotes).length < notesCountRef.current) captureHistory();
      setNotes(updatedNotes);
      // Auto-add position for newly typed notes (no explicit placement yet),
      // and drop positions whose note no longer exists (bulk clear / emptied text)
      // so no empty bubbles linger on the chart.
      setNotePositions((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (!updatedNotes[key]) {
            delete next[key];
            changed = true;
          }
        }
        const { rulerY: ry, rulerHeight: rh, containerH: H, containerW: W, imgH: iH, imgW: iW } = latestRef.current;
        // rulerY/rulerHeight are stored as image-space % (% of rendered image dims).
        // notePositions are container-space % (% of the full W×H container), since
        // note bubbles render inside the CSS transform at `left/top: pos%`.
        // Converting image-space → container-space avoids letterbox offset bugs.
        const imgTop = iH > 0 ? (H - iH) / 2 : 0;
        const refH = iH > 0 ? iH : H;
        const imgLeft = iW > 0 ? (W - iW) / 2 : 0;
        const refW = iW > 0 ? iW : W;
        // No Y clamp — multi-page PDFs have imgH > H, so autoY can legitimately exceed 100%
        const autoY = ((imgTop + (ry + rh / 2) / 100 * refH) / H) * 100;
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
    [captureHistory]
  );

  // Delete a note: removes both text and position
  const handleNoteDelete = useCallback((key: string) => {
    captureHistory();
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
  }, [captureHistory]);

  const handleComplete = useCallback(() => {
    captureHistory();
    const { rulerY: ry, rulerHeight: rh, rulerX: rx, rulerOrientation: orientation, rulerDirection: direction, rulers: rs, subPatterns: subs, activeSubId: asid } = latestRef.current;
    const rulerId = activeRulerIdRef.current;
    const ruler = rs.find((r) => r.id === rulerId);
    // Advance the sub-pattern linked to this ruler; unlinked rulers advance the active one.
    const targetSubId = ruler?.sub_id && subs.some((s) => s.id === ruler.sub_id)
      ? ruler.sub_id
      : (subs.some((s) => s.id === asid) ? asid : subs[0]?.id);
    const targetSub = subs.find((s) => s.id === targetSubId);
    setSubPatterns((prev) => prev.map((s) => (s.id === targetSubId ? { ...s, current_row: s.current_row + 1, ...(s.stitch_reset_on_row ? { stitch_count: 0 } : {}) } : s)));
    addSession(pattern.id, { rows: 1 }); setSessionStats(getSession(pattern.id));

    // Repeat section: finishing the last row of a pass (but not the final pass) sends the
    // ruler back to the first row of the section instead of one row forward.
    const completedRow = (targetSub?.current_row ?? 0) + 1;
    const info = targetSub ? repeatInfoForRow(targetSub, completedRow) : null;
    const wraps = !!info && info.phase === 'in' && info.rowInPass === info.rows && info.pass < info.count;
    const stepsForward = wraps ? -(info!.rows - 1) : 1;
    const travel = (direction === 'up' ? -1 : 1) * rh * stepsForward;
    // Passes 2+ re-knit rows that are already marked; don't stack a duplicate mark there.
    const isRepeatPass = !!info && info.phase === 'in' && info.pass > 1;
    const isHoriz = orientation === 'horizontal';
    const newMark: CompletedMark = isHoriz
      ? { y: rx, height: rh, orientation: 'horizontal', ruler_id: rulerId }
      : { y: ry, height: rh, ruler_id: rulerId };
    setCompletedMarks((prev) => {
      if (isRepeatPass && prev.some((m) =>
        (m.orientation === 'horizontal') === isHoriz &&
        (m.ruler_id ?? rulerId) === rulerId &&
        Math.abs(m.y - newMark.y) < rh * 0.5 && Math.abs(m.height - rh) < rh * 0.5
      )) return prev;
      return [...prev, newMark];
    });
    if (isHoriz) setRulerX(rx + travel); else setRulerY(ry + travel);
    // Follow: when the moved ruler leaves the middle band of the screen, scroll to it (zoom unchanged).
    if (followRulerRef.current) {
      const { viewTransform: tr, containerH: H, containerW: W, imgH: iH, imgW: iW } = latestRef.current;
      const frac = isHoriz
        ? (((iW > 0 ? (W - iW) / 2 : 0) + ((rx + travel + rh / 2) / 100) * (iW > 0 ? iW : W) - W / 2) * tr.scale + W / 2 + tr.x) / W
        : (((iH > 0 ? (H - iH) / 2 : 0) + ((ry + travel + rh / 2) / 100) * (iH > 0 ? iH : H) - H / 2) * tr.scale + H / 2 + tr.y) / H;
      if (frac < 0.22 || frac > 0.78) requestAnimationFrame(() => viewerRef.current?.goToRuler({ keepScale: true }));
    }
    if (wraps) setRepeatToast(t('repeat.nextPass', { pass: info!.pass + 1, count: info!.count }));
  }, [captureHistory, setRulerX, setRulerY, t, pattern.id]);

  // ---- Multi-ruler management ----
  // Activating a ruler also activates its linked sub-pattern, so the row counter follows.
  const activateRuler = useCallback((id: string) => {
    const { rulers: rs, subPatterns: subs } = latestRef.current;
    const r = rs.find((x) => x.id === id);
    if (!r) return;
    setActiveRulerId(id);
    activeRulerIdRef.current = id;
    if (r.sub_id && subs.some((s) => s.id === r.sub_id)) setActiveSubId(r.sub_id);
  }, []);

  // Selecting a sub-pattern activates the ruler linked to it (if any).
  const handleSelectSub = useCallback((subId: string) => {
    setActiveSubId(subId);
    const linked = latestRef.current.rulers.find((r) => r.sub_id === subId);
    if (linked && linked.id !== activeRulerIdRef.current) {
      setActiveRulerId(linked.id);
      activeRulerIdRef.current = linked.id;
    }
  }, []);

  const handleLinkRulerToSub = useCallback((rulerId: string, subId: string | undefined) => {
    captureHistory();
    // A sub-pattern is linked to at most one ruler
    setRulers((prev) => prev.map((r) =>
      r.id === rulerId ? { ...r, sub_id: subId } : (subId && r.sub_id === subId ? { ...r, sub_id: undefined } : r)
    ));
    if (subId && rulerId === activeRulerIdRef.current) setActiveSubId(subId);
  }, [captureHistory]);

  // New ruler: copies the active ruler's size/direction, lands at the screen center,
  // and is linked to the first sub-pattern that has no ruler yet.
  const handleAddRuler = useCallback(() => {
    const { rulers: rs, viewTransform: tr, containerW: W, containerH: H, imgW: iW, imgH: iH, subPatterns: subs, activeSubId: asid } = latestRef.current;
    if (rs.length >= MAX_RULERS) return;
    captureHistory();
    const base = rs.find((r) => r.id === activeRulerIdRef.current) ?? rs[0];
    const contentX = W / 2 - tr.x / tr.scale;
    const contentY = H / 2 - tr.y / tr.scale;
    const cx = iW > 0 ? ((contentX - (W - iW) / 2) / iW) * 100 : (contentX / W) * 100;
    const cy = iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100;
    const used = new Set(rs.map((r) => r.color));
    const color = RULER_COLORS.find((c) => !used.has(c)) ?? RULER_COLORS[rs.length % RULER_COLORS.length];
    const nums = rs.map((r) => Number((/(\d+)\s*$/.exec(r.name) ?? [])[1])).filter((n) => !isNaN(n));
    const name = rulerNameFor((nums.length ? Math.max(...nums) : rs.length) + 1);
    // If the base ruler was implicitly following the active sub-pattern, make that explicit first
    const baseSubId = base.sub_id ?? (subs.some((s) => s.id === asid) ? asid : undefined);
    const linkedSubs = new Set(rs.map((r) => r.id === base.id ? baseSubId : r.sub_id).filter(Boolean));
    const freeSub = subs.find((s) => !linkedSubs.has(s.id));
    const newRuler: Ruler = {
      id: generateId(),
      name,
      sub_id: freeSub?.id,
      position_y: base.orientation === 'vertical' ? cy - base.height / 2 : base.position_y,
      position_x: base.orientation === 'horizontal' ? cx - base.height / 2 : base.position_x,
      height: base.height,
      direction: base.direction,
      orientation: base.orientation,
      rotation: base.rotation,
      color,
    };
    setRulers((prev) => [
      ...prev.map((r) => (r.id === base.id && !r.sub_id && baseSubId ? { ...r, sub_id: baseSubId } : r)),
      newRuler,
    ]);
    setActiveRulerId(newRuler.id);
    activeRulerIdRef.current = newRuler.id;
    if (freeSub) setActiveSubId(freeSub.id);
  }, [captureHistory, rulerNameFor]);

  const [editingRulerId, setEditingRulerId] = useState<string | null>(null);
  const handleRenameRuler = useCallback((id: string, name: string) => {
    const n = name.trim().slice(0, 24);
    if (!n) return;
    if (latestRef.current.rulers.find((r) => r.id === id)?.name === n) return;
    captureHistory();
    setRulers((prev) => prev.map((r) => (r.id === id ? { ...r, name: n } : r)));
  }, [captureHistory]);
  const handleRecolorRuler = useCallback((id: string, color: string) => {
    captureHistory();
    setRulers((prev) => prev.map((r) => (r.id === id ? { ...r, color } : r)));
  }, [captureHistory]);
  // Long-press on a floating ruler chip opens the editor for that ruler
  const chipPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chipLongPressedRef = useRef(false);
  const cancelChipPress = useCallback(() => {
    if (chipPressTimerRef.current) { clearTimeout(chipPressTimerRef.current); chipPressTimerRef.current = null; }
  }, []);
  useEffect(() => cancelChipPress, [cancelChipPress]);

  // Row-linked note reminder: notes are keyed "subId:row[:uuid]".
  const notesForRow = useCallback((subId: string, row: number): string[] => {
    const out: string[] = [];
    for (const [key, text] of Object.entries(latestRef.current.notesMap ?? {})) {
      const parts = key.split(':');
      if (parts.length >= 2 && parts[0] === subId && Number(parts[1]) === row && text?.trim()) out.push(text.trim());
    }
    return out;
  }, []);
  const hasRowNotes = useMemo(() => {
    const sid = activeSub?.id; if (!sid) return false;
    return notesForRow(sid, activeSub.current_row || 0).length > 0 || notesForRow(sid, (activeSub.current_row || 0) + 1).length > 0;
  }, [activeSub, notesForRow]);
  const [noteToast, setNoteToast] = useState<string | null>(null);
  const lastReminderRef = useRef<string>('');
  useEffect(() => {
    if (!activeSub) return;
    const row = activeSub.current_row || 0;
    const key = `${activeSub.id}:${row}`;
    if (lastReminderRef.current === '') { lastReminderRef.current = key; return; } // no toast on mount
    if (lastReminderRef.current === key) return;
    lastReminderRef.current = key;
    const now = notesForRow(activeSub.id, row);
    const next = notesForRow(activeSub.id, row + 1);
    const msg = now.length ? `${t('notes.reminderNow', { row })}: ${now[0]}` : next.length ? `${t('notes.reminderNext', { row: row + 1 })}: ${next[0]}` : null;
    if (msg) setNoteToast(msg.length > 90 ? msg.slice(0, 88) + '…' : msg);
  }, [activeSub, notesForRow, t]);
  useEffect(() => {
    if (!noteToast) return;
    const id = setTimeout(() => setNoteToast(null), 5000);
    return () => clearTimeout(id);
  }, [noteToast]);

  // Short notice when the ruler jumps back for the next repeat pass
  const [repeatToast, setRepeatToast] = useState<string | null>(null);
  useEffect(() => {
    if (!repeatToast) return;
    const id = setTimeout(() => setRepeatToast(null), 2800);
    return () => clearTimeout(id);
  }, [repeatToast]);

  // Deleting a ruler keeps the completed marks it produced (they are history).
  const handleDeleteRuler = useCallback((id: string) => {
    const { rulers: rs } = latestRef.current;
    if (rs.length <= 1) return;
    const target = rs.find((r) => r.id === id);
    if (!target) return;
    if (!confirm(t('ruler.deleteConfirm').replace('{name}', target.name))) return;
    captureHistory();
    const remaining = rs.filter((r) => r.id !== id);
    setRulers(remaining);
    if (activeRulerIdRef.current === id) activateRuler(remaining[0].id);
  }, [captureHistory, activateRuler, t]);

  // "Go to ruler": first press jumps to the active ruler; pressing again shortly after
  // cycles to the next ruler (and activates it) when there are several.
  const pendingGoToRulerIdRef = useRef<string | null>(null);
  // "Go to ruler" always centers the ACTIVE ruler. Switching rulers is done with the
  // floating chips, the dashed bands, or Tab — never by re-pressing this button.
  const handleGoToRuler = useCallback(() => {
    viewerRef.current?.goToRuler();
  }, []);
  // One-tap switch: activate a ruler and scroll the view to it. Tapping the active one just jumps.
  const jumpToRuler = useCallback((id: string) => {
    if (id === activeRulerIdRef.current) { viewerRef.current?.goToRuler({ keepScale: true }); return; }
    pendingGoToRulerIdRef.current = id;
    activateRuler(id);
  }, [activateRuler]);
  const cycleRuler = useCallback((delta: 1 | -1) => {
    const { rulers: rs } = latestRef.current;
    if (rs.length < 2) return;
    const idx = rs.findIndex((r) => r.id === activeRulerIdRef.current);
    jumpToRuler(rs[(idx + delta + rs.length) % rs.length].id);
  }, [jumpToRuler]);
  // Keyboard: Tab / Shift+Tab cycles rulers (desktop) — only while the ruler UI is on screen
  // and no control has focus, so normal focus navigation keeps working.
  const rulerUiVisibleRef = useRef(false);
  rulerUiVisibleRef.current = showOverlays && !isDrawingMode && !showGuide && (!isCrochet || crochetShape === 'line');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInputTarget(e.target)) return;
      if (!rulerUiVisibleRef.current) return;
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae.tagName !== 'HTML') return;
      if (latestRef.current.rulers.length < 2) return;
      e.preventDefault();
      cycleRuler(e.shiftKey ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleRuler]);
  useEffect(() => {
    if (pendingGoToRulerIdRef.current !== activeRulerId) return;
    pendingGoToRulerIdRef.current = null;
    // Switching rulers must never change the zoom level — only scroll to the new ruler.
    const raf = requestAnimationFrame(() => viewerRef.current?.goToRuler({ keepScale: true }));
    return () => cancelAnimationFrame(raf);
  }, [activeRulerId]);

  // Remote / keyboard: page-turner remotes send PageDown/ArrowRight (Complete) and PageUp/ArrowLeft (Undo).
  const keyActionsRef = useRef({ complete: () => {}, undo: () => {} });
  keyActionsRef.current = {
    complete: (!isCrochet || crochetShape === 'line') ? handleComplete : handleCrochetCircleComplete,
    undo: handleUndo,
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isTextInputTarget(e.target)) return;
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae.tagName !== 'HTML') return; // let focused buttons keep Space/Enter
      if (!rulerUiVisibleRef.current && !isCrochet) return;
      const fwd = e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter';
      const back = e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace';
      if (!fwd && !back) return;
      e.preventDefault();
      if (fwd) keyActionsRef.current.complete(); else keyActionsRef.current.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCrochet]);

  // ---- help sheet actions ----
  const handleReplayGuide = useCallback(() => {
    try { localStorage.removeItem('kis_guide_dismissed'); } catch { /* ignore */ }
    setShowHelp(false);
    setShowRulerSettings(false);
    setShowSubPatternGuide(true);
  }, []);
  const handleShareImage = useCallback(async () => {
    const file = allFiles[activeFileIdx];
    if (!file || (file.file_type ?? pattern.file_type) === 'pdf') { alert(t('export.fail')); return; }
    setExporting(true);
    try {
      const { rulers: rs, activeRulerId: aid, subPatterns: subs, activeSubId: asid } = latestRef.current;
      const sub = subs.find((x) => x.id === asid);
      const blob = await buildProgressImage({
        imageUrl: file.url, marks: completedMarks, rulers: (!isCrochet || crochetShape === 'line') ? rs : [], activeRulerId: aid, title: pattern.title,
        caption: sub ? `${sub.name} · ${sub.current_row}/${sub.total_rows}` : undefined,
      });
      const how = await shareOrDownload(blob, `${pattern.title}-progress.jpg`, pattern.title);
      if (how === 'downloaded') alert(t('export.shareFail'));
    } catch {
      alert(t('export.fail'));
    } finally {
      setExporting(false);
    }
  }, [allFiles, activeFileIdx, pattern.file_type, pattern.title, completedMarks, isCrochet, crochetShape, t]);
  const handleBackup = useCallback(() => {
    imageStatesRef.current[activeFileIdx] = structuredClone(perImageStateLatest.current);
    downloadJson({
      exported_at: new Date().toISOString(),
      pattern: { id: pattern.id, title: pattern.title, type: pattern.type, file_url: pattern.file_url, file_type: pattern.file_type, extra_image_urls: pattern.extra_image_urls ?? [], image_names: pattern.image_names ?? [], total_rows: pattern.total_rows, yarn: pattern.yarn, needle: pattern.needle },
      progress: { sub_patterns: subPatterns, active_sub_pattern_id: activeSubId, image_states: imageStatesRef.current },
    }, `${pattern.title}-backup.json`);
  }, [activeFileIdx, pattern, subPatterns, activeSubId]);

  // Completed marks are tinted with their ruler's color; the default accent keeps the classic green.
  const markColors = useMemo(
    () => Object.fromEntries(rulers.filter((r) => r.color !== DEFAULT_RULER_COLOR).map((r) => [r.id, r.color])) as Record<string, string>,
    [rulers]
  );
  // Repeat status of the active sub-pattern for the row counter ("Repeat 2/6 · R3/8")
  const [repeatLabel, repeatLabelShort] = useMemo((): [string | undefined, string | undefined] => {
    if (!activeSub) return [undefined, undefined];
    const info = repeatInfoForRow(activeSub, (activeSub.current_row || 0) + 1);
    if (!info) {
      if (isCrochet && (activeSub.motif_target ?? 0) > 0) {
        const m = t('crochet.motifProgress', { n: activeSub.motif_count ?? 0, total: activeSub.motif_target ?? 0 });
        return [m, m];
      }
      return [undefined, undefined];
    }
    if (info.phase === 'before') return [t('repeat.before'), t('repeat.before')];
    if (info.phase === 'after') return [t('repeat.done'), t('repeat.done')];
    return [
      t('repeat.status', { pass: info.pass, count: info.count, row: info.rowInPass, rows: info.rows }),
      t('repeat.short', { pass: info.pass, count: info.count }),
    ];
  }, [activeSub, t, isCrochet]);

  // Convert screen % → image-space % for marker placement (markers now outside CSS transform)
  // Accounts for letterbox offset so positions are device-independent.
  const screenToContent = useCallback((screenX: number, screenY: number) => {
    const { viewTransform: t, containerH: H, containerW: W, imgH: iH, imgW: iW } = latestRef.current;
    const sx = (screenX / 100) * W;
    const sy = (screenY / 100) * H;
    const contentPx = (sx - W / 2 - t.x) / t.scale + W / 2;
    const contentPy = (sy - H / 2 - t.y) / t.scale + H / 2;
    const imgLeft = iW > 0 ? (W - iW) / 2 : 0;
    const imgTop = iH > 0 ? (H - iH) / 2 : 0;
    const refW = iW > 0 ? iW : W;
    const refH = iH > 0 ? iH : H;
    return {
      x: Math.max(0, Math.min(100, (contentPx - imgLeft) / refW * 100)),
      // No Y clamp — multi-page PDFs are taller than the container (imgH > H),
      // so valid Y positions can exceed 100%. Clamping would restrict notes to
      // the top ~1/N of an N-page PDF.
      y: (contentPy - imgTop) / refH * 100,
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
        i === index ? { ...m, y: imageX, height: imageRight - imageX, orientation: 'horizontal' as const } : m
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
        i === index ? { ...m, y: imageY, height: imageBottom - imageY } : m
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
    // pos is screen-space % (NoteBubbles container is now outside CSS transform).
    // Convert to content-space % before storing so positions survive zoom changes.
    const contentPos = screenToContent(pos.x, pos.y);
    setNotePositions((prev) => ({ ...prev, [key]: contentPos }));
  }, [screenToContent]);

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
    setRulers((prev) => prev.some((r) => r.sub_id === id) ? prev.map((r) => (r.sub_id === id ? { ...r, sub_id: undefined } : r)) : prev);
    const next = subPatterns.filter((s) => s.id !== id);
    setSubPatterns(next);
    delete crochetBySubRef.current[id];
    if (activeSubId === id && next.length > 0) setActiveSubId(next[0].id);
    // Other images may have this sub saved as their active one; point them at the first sub.
    for (const slot of imageStatesRef.current) {
      if (slot && slot.active_sub_id === id) slot.active_sub_id = next[0]?.id;
    }
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
  // deps cover all values contentToScreen* functions read from closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const screenKnittingMarks = useMemo<KnittingMark[]>(() => knittingMarks.map((m) => ({
    ...m,
    x: contentToScreenX(m.x),
    y: contentToScreenY(m.y),
  })), [knittingMarks, viewTransform, containerH, containerW, imgH, imgW]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const screenCrochetMarks = useMemo<CrochetMark[]>(() => crochetMarks.map((m) => ({
    ...m,
    x: contentToScreenX(m.x),
    y: contentToScreenY(m.y),
  })), [crochetMarks, viewTransform, containerH, containerW, imgH, imgW]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const screenNotePositions = useMemo<Record<string, NotePosition>>(() => {
    const result: Record<string, NotePosition> = {};
    for (const [key, pos] of Object.entries(notePositions)) {
      result[key] = { x: contentToScreenX(pos.x), y: contentToScreenY(pos.y) };
    }
    return result;
  }, [notePositions, viewTransform, containerH, containerW, imgH, imgW]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const screenCompletedMarks = useMemo<CompletedMark[]>(() => completedMarks.map((m) => {
    if (m.orientation === 'horizontal') {
      const x = contentToScreenX(m.y);
      const right = contentToScreenX(m.y + m.height);
      return { ...m, y: x, height: right - x, orientation: 'horizontal' as const };
    }
    const y = contentToScreenY(m.y);
    const bottom = contentToScreenY(m.y + m.height);
    return { ...m, y, height: bottom - y };
  }), [completedMarks, viewTransform, containerH, containerW, imgH, imgW]); // eslint-disable-line react-hooks/exhaustive-deps

  const screenCompletedRings = useMemo(() => completedCrochetRings.map(ring => ({
    cx: contentToScreenX(ring.cx),
    cy: contentToScreenY(ring.cy),
    r: contentToScreenR(ring.r),
    rInner: ring.rInner != null ? contentToScreenR(ring.rInner) : undefined,
    ry: ring.ry != null ? contentToScreenRy(ring.ry) : undefined,
    ryInner: ring.ryInner != null ? contentToScreenRy(ring.ryInner) : undefined,
    shape: ring.shape,
    sweep: ring.sweep,
  })), [completedCrochetRings, viewTransform, containerH, containerW, imgH, imgW]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-[100dvh] bg-[#f5edd6]">
      {/* Save error popup */}
      {showSaveErrorPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-2xl shadow-xl max-w-sm w-full p-5 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="font-bold text-sm text-[#3d2b1f] leading-snug">{t('view.saveErrorPopup.title')}</p>
                <p className="text-xs text-[#7a5c46] mt-1.5 leading-relaxed">{t('view.saveErrorPopup.desc')}</p>
              </div>
            </div>
            <button
              onClick={() => setShowSaveErrorPopup(false)}
              className="self-end text-xs font-bold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] rounded-lg px-4 py-2 hover:bg-[#9a4318] transition-colors"
            >
              {t('view.saveErrorPopup.close')}
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-[#f5edd6] border-b-2 border-[#b07840] px-2 sm:px-4 py-2 flex items-center justify-between shrink-0 safe-top">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={async () => {
              if (isSavingBack) return;
              setIsSavingBack(true);
              try {
                await saveAll();
              } catch {
                // Save failed — navigate anyway so the user is never stuck
              } finally {
                setIsSavingBack(false);
              }
              navigate('/dashboard');
            }}
            disabled={isSavingBack}
            className="text-[#a08060] hover:text-[#3d2b1f] shrink-0 p-1 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors disabled:opacity-50"
          >
            {isSavingBack ? (
              <div className="w-4 h-4 border-2 border-[#b5541e] border-t-transparent rounded-full animate-spin" />
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
              <button
                type="button"
                onClick={() => { if (!wakeLockSupported) alert(t('wake.unsupported')); else if (!wakeLockActive) requestWakeLock(); }}
                className={`flex items-center gap-1 text-[10px] shrink-0 ${wakeLockActive ? 'text-[#7a9c72]' : 'text-[#b5541e]'}`}
                title={!wakeLockSupported ? t('wake.unsupported') : wakeLockActive ? t('wake.on') : t('wake.off')}
                aria-label={!wakeLockSupported ? t('wake.unsupported') : wakeLockActive ? t('wake.on') : t('wake.off')}
              >
                {wakeLockActive ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M3 3l18 18" />
                  </svg>
                )}
              </button>
              {(pattern.yarn || pattern.needle) && (
                <p className="hidden sm:block text-[11px] text-[#a08060] truncate">
                  {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
                </p>
              )}
              {!isOnline && status !== 'error' && (
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
              {status === 'error' && (
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

          {allFiles.length > 1 && !isLandscapePhone && (
            <button
              onClick={() => setSplitIdx((v) => (v == null ? (activeFileIdx === 0 ? 1 : 0) : null))}
              className={`hidden lg:flex h-9 px-2 items-center gap-1 rounded-lg transition-colors ${splitIdx != null ? 'bg-[#b5541e] text-[#fdf6e8]' : 'text-[#7a5c46] hover:bg-[#ede5cc]'}`}
              title={splitIdx != null ? t('view.sideBySideOff') : t('view.sideBySide')}
              aria-pressed={splitIdx != null}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="8" height="16" rx="1.5" /><rect x="13" y="4" width="8" height="16" rx="1.5" /></svg>
              <span className="text-[10px] font-semibold">{t('view.sideBySide')}</span>
            </button>
          )}
          <button
            onClick={() => setShowHelp(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#b07840] transition-colors"
            title={t('help.title')}
            aria-label={t('help.title')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
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
                className={`flex-shrink-0 flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-t-lg text-xs font-semibold tracking-wide border-2 border-b-0 transition-colors ${
                  isActive
                    ? 'border-[#b07840] bg-[#fdf6e8] text-[#3d2b1f]'
                    : 'border-transparent bg-transparent text-[#a08060] hover:text-[#7a5c46]'
                }`}
              >
                {(pattern.image_names?.[i] && pattern.image_names[i] !== '')
                  ? pattern.image_names[i]
                  : t('form.imageN').replace('{n}', String(i + 1))}
                {hasProgress && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#b5541e] opacity-70 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={isLandscapePhone ? 'flex flex-row flex-1 min-h-0' : 'contents'}>
      <div className="flex-1 min-h-0 flex flex-row">
      {/* Viewer area */}
      <div className="flex-1 relative min-h-0 min-w-0 p-1 sm:p-2">
        <PatternViewer
          ref={viewerRef}
          fileUrl={allFiles[activeFileIdx]?.url ?? pattern.file_url}
          fileType={allFiles[activeFileIdx]?.file_type ?? pattern.file_type}
          rulerYPercent={isCrochet && crochetShape !== 'line' ? crochetCy : rulerOrientation === 'horizontal' ? 50 : rulerY + rulerHeight / 2}
          rulerXPercent={isCrochet && crochetShape !== 'line' ? crochetCx : rulerOrientation === 'horizontal' ? rulerX + rulerHeight / 2 : undefined}
          onTransformChange={handleTransformChange}
          onImageSize={handleImageSize}
          locked={viewLocked}
          reloadKey={reloadKey}
          onLoadError={() => { setIsImageLoading(false); setImageLoadError(true); }}
          cachedPageRatios={pdfPageRatios}
          onPageRatios={setPdfPageRatios}
          onGoToRuler={(!isCrochet || crochetShape === 'line') ? handleGoToRuler : undefined}
          highlightBringRuler={showGuide}
          isDrawingMode={isDrawingMode}
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
            const { viewTransform: t, containerH: H, containerW: W, imgH: iH, imgW: iW, rulerOrientation: orientation } = latestRef.current;
            // First placement (onboarding): screen-based default, slightly thicker so it stands out
            let rh = latestRef.current.rulerHeight;
            if (showGuideRef.current) {
              const { subPatterns: subs, activeSubId: asid } = latestRef.current;
              const sub = subs.find((s) => s.id === asid);
              const totalRows = (sub?.total_rows ?? 0) > 1 ? sub!.total_rows : (pattern.total_rows > 1 ? pattern.total_rows : 0);
              const initialH = defaultRulerHeightPct({ containerH: H, imgH: iH, imgW: iW, scale: t.scale, orientation, totalRows, boost: 1.5 });
              if (initialH != null) {
                setRulerHeight(initialH);
                latestRef.current.rulerHeight = initialH;
                rh = initialH;
                setSliderViewMax(Math.min(LOG_RULER_MAX, Math.max(MIN_VIEW_RANGE * 2, initialH * 4)));
              }
            }
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
          contentOverlay={showOverlays ? (
            <NoteBubbles
              notes={notes}
              positions={screenNotePositions}
              onPositionChange={handleNotePositionChange}
              onDelete={handleNoteDelete}
            />
          ) : undefined}
        >
          {!isCrochet && showOverlays && (
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
          {isCrochet && showOverlays && (
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
          {showOverlays && <CompletedOverlay
            marks={screenCompletedMarks}
            rotation={(!isCrochet || crochetShape === 'line') ? rulerRotation : 0}
            onUpdate={handleCompletedMarkUpdate}
            onDelete={handleCompletedMarkDelete}
            onDeleteAll={handleCompletedMarkDeleteAll}
            onSelectionChange={setHasMarkSelection}
            onDragStart={captureHistory}
            markColors={markColors}
          />}
          {/* Waiting rulers — dashed, tap to activate */}
          {(!isCrochet || crochetShape === 'line') && !showGuide && imgH > 0 && showOverlays && rulers.length > 1 && rulers.map((r) => {
            if (r.id === activeRulerId) return null;
            const isH = r.orientation === 'horizontal';
            const position = isH ? contentToScreenX(r.position_x) : contentToScreenY(r.position_y);
            const size = isH
              ? (imgW > 0 ? (r.height / 100) * imgW * viewTransform.scale / containerW * 100 : r.height * viewTransform.scale)
              : (imgH > 0 ? (r.height / 100) * imgH * viewTransform.scale / containerH * 100 : r.height * viewTransform.scale);
            return (
              <InactiveRulerBand
                key={r.id}
                position={position}
                size={size}
                orientation={r.orientation}
                rotation={r.rotation}
                color={r.color}
                name={r.name}
                hint={t('ruler.tapToActivate')}
                onActivate={() => activateRuler(r.id)}
              />
            );
          })}
          {(!isCrochet || crochetShape === 'line') && !showGuide && imgH > 0 && showOverlays && (
            <RowRuler
              accentColor={activeRuler.color}
              label={rulers.length > 1 ? activeRuler.name : undefined}
              positionY={screenRulerY}
              height={rulerOrientation === 'horizontal' ? screenRulerWidth : screenRulerHeight}
              direction={rulerDirection}
              orientation={rulerOrientation}
              positionX={screenRulerX}
              rotation={rulerRotation}
              isAdjusting={isAdjustingRuler}
              isPlacingMarker={isCrochet ? isPlacingMarker : isPlacingKnittingMarker}
              showSettings={showRulerSettings}
              initialShowActionBar={isFirstOpenRef.current}
              onChangePosition={handleRulerPositionChange}
              onChangePositionX={handleRulerPositionXChange}
              onChangeHeight={handleRulerHeightChange}
              onToggleSettings={handleToggleRulerSettings}
              onDragStart={captureHistory}
            />
          )}

          {isCrochet && crochetShape !== 'line' && imgH > 0 && showOverlays && (
            <CrochetRuler
              cx={contentToScreenX(crochetCx)}
              cy={contentToScreenY(crochetCy)}
              r={contentToScreenR(crochetR)}
              ry={(crochetShape === 'ellipse' || crochetShape === 'rect') ? contentToScreenRy(crochetRy) : undefined}
              shape={crochetShape === 'ellipse' ? 'ellipse' : crochetShape === 'rect' ? 'rect' : 'circle'}
              completedRings={screenCompletedRings}
              containerW={containerW}
              containerH={containerH}
              onCenterChange={handleCrochetCenterChange}
              onRadiusChange={handleCrochetRadiusChange}
              onRyChange={(crochetShape === 'ellipse' || crochetShape === 'rect') ? handleCrochetRyChange : undefined}
              rowHeight={crochetRowHeight != null ? contentToScreenRy(crochetRowHeight) : undefined}
              onRowHeightChange={handleCrochetRowHeightChange}

              onToggleSettings={handleToggleCrochetSettings}
              rotation={crochetRotation}
              onRotationChange={setCrochetRotation} /* CrochetRuler calls onDragStart() once per gesture */
              onShapeChange={handleCrochetShapeChange}
              showSettings={showCrochetSettings}
              initialShowActionBar={isFirstOpenRef.current}
              isAdjusting={isAdjustingCrochetRadius}
              onAdjustingChange={setIsAdjustingCrochetRadius}
              onDragStart={captureHistory}
              onDeleteRing={(i) => { captureHistory(); setCompletedCrochetRings(prev => prev.filter((_, idx) => idx !== i)); updateActiveSub(s => ({ ...s, current_row: Math.max(0, s.current_row - 1) })); }}
              onDeleteAllRings={() => { captureHistory(); const count = latestRef.current.completedCrochetRings.length; setCompletedCrochetRings([]); updateActiveSub(s => ({ ...s, current_row: Math.max(0, s.current_row - count) })); }}
              onUpdateRing={handleCrochetRingUpdate} /* history captured in CrochetRuler onRingDown */
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
                setCrochetRotation(0);
                setCrochetRowHeight(null);
              }}
            />
          )}
          {isCrochet && crochetShape === 'line' && completedCrochetRings.length > 0 && imgH > 0 && showOverlays && (
            <CrochetRuler
              ringsOnly
              completedRings={screenCompletedRings}
              containerW={containerW}
              containerH={containerH}
              rotation={crochetRotation}
              onDragStart={captureHistory}
              onDeleteRing={(i) => { captureHistory(); setCompletedCrochetRings(prev => prev.filter((_, idx) => idx !== i)); updateActiveSub(s => ({ ...s, current_row: Math.max(0, s.current_row - 1) })); }}
              onDeleteAllRings={() => { captureHistory(); const count = latestRef.current.completedCrochetRings.length; setCompletedCrochetRings([]); updateActiveSub(s => ({ ...s, current_row: Math.max(0, s.current_row - count) })); }}
              onUpdateRing={handleCrochetRingUpdate} /* history captured in CrochetRuler onRingDown */
            />
          )}

          {/* Drawing canvas — always mounted to preserve paths, active only in drawing mode */}
          <DrawingCanvas
            paths={drawingPaths}
            isDrawingMode={isDrawingMode}
            tool={drawingTool}
            color={drawingColor}
            strokeWidth={drawingStrokeWidth}
            opacity={drawingOpacity}
            viewTransform={viewTransform}
            containerW={containerW}
            containerH={containerH}
            imgW={imgW}
            imgH={imgH}
            selectedPathId={selectedPathId}
            onSelectPath={setSelectedPathId}
            onDeletePath={(id) => { captureHistory(); setDrawingPaths(prev => prev.filter(p => p.id !== id)); setSelectedPathId(null); }}
            onDrawStart={captureHistory}
            onPathAdd={(path) => { setDrawingPaths(prev => [...prev, path]); }}
            onPathsChange={setDrawingPaths}
          />

          {/* Drawing toolbar — shown when drawing mode is active */}
          {isDrawingMode && (
            <div
              className="absolute top-2 left-2 right-2 z-30 bg-[#fdf6e8]/97 backdrop-blur-sm rounded-2xl border-2 border-[#b07840] shadow-lg px-3 py-2 flex flex-col gap-1.5"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Row 1: [Undo Redo] | Colors | RESET | [X close mobile] */}
              <div className="flex items-center gap-1.5">
                <button onClick={handleUndo} disabled={!canUndo} title={t('view.undo')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-transparent transition-colors disabled:opacity-30 text-[#7a5c46] hover:bg-[#ede5cc] disabled:hover:bg-transparent flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
                  </svg>
                </button>
                <button onClick={handleRedo} disabled={!canRedo} title={t('view.redo')}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-transparent transition-colors disabled:opacity-30 text-[#7a5c46] hover:bg-[#ede5cc] disabled:hover:bg-transparent flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3L21 13"/>
                  </svg>
                </button>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0" />
                <div className="flex items-center gap-1 flex-1 justify-center">
                  {DRAW_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setDrawingColor(c)}
                      className="rounded-full border-2 transition-transform flex-shrink-0"
                      style={{
                        width: 20, height: 20,
                        background: c,
                        borderColor: drawingColor === c ? '#3d2b1f' : 'transparent',
                        transform: drawingColor === c ? 'scale(1.25)' : 'scale(1)',
                        boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #ccc' : undefined,
                      }}
                      title={c}
                    />
                  ))}
                </div>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0" />
                <button
                  onClick={() => { captureHistory(); setDrawingPaths([]); setSelectedPathId(null); }}
                  title={t('draw.clearAll')}
                  className="h-6 px-2 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] hover:text-[#b5541e] transition-colors text-[10px] font-bold tracking-wide flex-shrink-0"
                >
                  RESET
                </button>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0 sm:hidden" />
                <button
                  onClick={() => setIsDrawingMode(false)}
                  title={t('draw.close')}
                  className="sm:hidden flex items-center justify-center w-7 h-7 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0"
                >×</button>
              </div>
              {/* Row 2: Tools + Stroke slider + Opacity slider */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {DRAW_TOOLS.map(({ id, label, icon }) => (
                    <button
                      key={id}
                      onClick={() => setDrawingTool(id)}
                      title={t(label)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${
                        drawingTool === id
                          ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                          : 'text-[#7a5c46] border-transparent hover:bg-[#ede5cc]'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0" />
                <div className="relative rounded-full flex-shrink-0 overflow-hidden"
                  style={{
                    width: Math.min(drawingStrokeWidth, 16), height: Math.min(drawingStrokeWidth, 16),
                    backgroundImage: 'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
                    backgroundSize: '6px 6px', backgroundPosition: '0 0,0 3px,3px -3px,-3px 0px',
                  }}
                >
                  <div className="absolute inset-0 rounded-full" style={{ background: drawingColor, opacity: drawingOpacity / 100 }} />
                </div>
                <input type="range" min={1} max={30} step={1} value={drawingStrokeWidth}
                  onChange={e => setDrawingStrokeWidth(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-[#b5541e] cursor-pointer min-w-0"
                />
                <span className="text-[10px] font-mono text-[#7a5c46] w-5 text-right flex-shrink-0">{drawingStrokeWidth}</span>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0" />
                <div className="relative rounded-sm flex-shrink-0 overflow-hidden border border-[#b07840]/40"
                  style={{
                    width: 12, height: 12,
                    backgroundImage: 'linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)',
                    backgroundSize: '6px 6px', backgroundPosition: '0 0,0 3px,3px -3px,-3px 0px',
                  }}
                >
                  <div className="absolute inset-0" style={{ background: `linear-gradient(to right, transparent, ${drawingColor})` }} />
                </div>
                <input type="range" min={5} max={100} step={5} value={drawingOpacity}
                  onChange={e => setDrawingOpacity(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-[#b5541e] cursor-pointer min-w-0"
                />
                <span className="text-[10px] font-mono text-[#7a5c46] w-8 text-right flex-shrink-0">{drawingOpacity}%</span>
                <div className="w-px h-4 bg-[#d4b896] flex-shrink-0 hidden sm:block" />
                <button
                  onClick={() => setIsDrawingMode(false)}
                  title={t('draw.close')}
                  className="hidden sm:flex items-center justify-center w-7 h-7 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0 ml-1"
                >×</button>
              </div>
            </div>
          )}

          {/* Overlay visibility toggle + Drawing mode toggle */}
          <div className={`absolute top-3 right-3 z-40 flex flex-col gap-2 pointer-events-none ${(showRulerSettings || isDrawingMode) ? 'hidden' : ''}`}>
            <button
              className={`pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full border shadow transition-colors ${
                showOverlays
                  ? 'bg-[#fdf6e8]/90 text-[#7a5c46] border-[#b07840] hover:bg-[#fdf6e8]'
                  : 'bg-[#3d2b1f]/80 text-[#fdf6e8] border-[#3d2b1f] hover:bg-[#3d2b1f]'
              }`}
              onClick={() => setShowOverlays(v => !v)}
              onPointerDown={(e) => e.stopPropagation()}
              title={showOverlays ? t('view.hideOverlays') : t('view.showOverlays')}
            >
              {showOverlays ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
            <button
              className={`pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full border shadow transition-colors ${
                viewLocked
                  ? 'bg-[#3d2b1f]/85 text-[#fdf6e8] border-[#3d2b1f] hover:bg-[#3d2b1f]'
                  : 'bg-[#fdf6e8]/90 text-[#7a5c46] border-[#b07840] hover:bg-[#fdf6e8]'
              }`}
              onClick={toggleViewLock}
              onPointerDown={(e) => e.stopPropagation()}
              title={viewLocked ? t('view.viewLockOff') : t('view.viewLock')}
              aria-pressed={viewLocked}
            >
              {viewLocked ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V7a4 4 0 118 0v4" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V7a4 4 0 017.8-1.3" />
                </svg>
              )}
            </button>
            <button
              className={`pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full border shadow transition-colors ${
                isDrawingMode
                  ? 'bg-[#b5541e] text-[#fdf6e8] border-[#b5541e] hover:bg-[#9a4318]'
                  : 'bg-[#fdf6e8]/90 text-[#7a5c46] border-[#b07840] hover:bg-[#fdf6e8]'
              }`}
              onClick={() => { setIsDrawingMode(v => !v); setSelectedPathId(null); setShowRulerSettings(false); }}
              onPointerDown={(e) => e.stopPropagation()}
              title={t('draw.open')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6.586-6.586a2 2 0 012.828 0l.172.172a2 2 0 010 2.828L12 14H9v-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h4l11-11" opacity="0.4" />
              </svg>
            </button>
          </div>

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
              <div className="absolute bottom-9 sm:bottom-12 left-1/2 -translate-x-1/2 max-w-[calc(100%-136px)] sm:max-w-[calc(100%-200px)] flex items-center gap-2 bg-[#b07840] text-[#fdf6e8] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none select-none">
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
        {(isImageLoading || imageLoadError) && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#fdf6e8]/70 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              {imageLoadError ? (
                <>
                  <p className="text-sm text-[#7a5c46] leading-relaxed whitespace-pre-line">{t('viewer.imageLoadError')}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setImageLoadError(false); setIsImageLoading(true); setReloadKey((k) => k + 1); }}
                      className="text-xs font-semibold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] px-4 py-2 rounded-lg hover:bg-[#9a4318] active:scale-95 transition-all"
                    >
                      {t('viewer.retry')}
                    </button>
                    <button
                      onClick={() => setImageLoadError(false)}
                      className="text-xs font-semibold text-[#7a5c46] bg-[#fdf6e8] border-2 border-[#b07840] px-4 py-2 rounded-lg hover:bg-[#f5edd6] active:scale-95 transition-all"
                    >
                      {t('viewer.imageLoadErrorClose')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="w-8 h-8 border-[3px] border-[#b07840] border-t-[#b5541e] rounded-full animate-spin" />
              )}
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


        {/* Ruler height settings popup — layout depends on orientation */}
        {showRulerSettings && showOverlays && (!isCrochet || crochetShape === 'line') && (() => {
          const facingDeg =
            rulerOrientation === 'vertical' && rulerDirection === 'up' ? 0 :
            rulerOrientation === 'horizontal' && rulerDirection === 'down' ? 90 :
            rulerOrientation === 'vertical' && rulerDirection === 'down' ? 180 : 270;
          return (
            <div
              className="absolute top-2 left-2 right-2 z-30 bg-[#fdf6e8]/97 backdrop-blur-sm rounded-2xl border-2 border-[#b07840] shadow-lg px-3 py-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Ruler row: switch / add / link to part / delete — all other controls target the active ruler */}
              <div className="w-full flex items-center gap-1.5 flex-wrap border-b border-[#d4b896] pb-1.5">
                {rulers.map((r) => {
                  const isAct = r.id === activeRulerId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => jumpToRuler(r.id)}
                      className={`flex items-center gap-1 px-2.5 h-8 rounded-full border text-[11px] font-bold select-none transition-colors ${
                        isAct ? 'border-[#9a4318] bg-[#b5541e] text-[#fdf6e8]' : 'border-[#b07840] bg-white text-[#7a5c46] hover:bg-[#fdf6e8]'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color, boxShadow: '0 0 0 1px #fdf6e8' }} />
                      {r.name}
                    </button>
                  );
                })}
                {rulers.length < MAX_RULERS && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleAddRuler}
                    title={t('ruler.add')}
                    aria-label={t('ruler.add')}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-[#b07840] text-[#b5541e] text-sm font-bold hover:bg-[#fdf6e8] active:scale-95 select-none leading-none"
                  >+</button>
                )}
                <label className="ml-auto flex items-center gap-1 text-[10px] text-[#7a5c46] font-bold whitespace-nowrap">
                  {t('ruler.linkedPart')}
                  <select
                    value={activeRuler.sub_id && subPatterns.some((s) => s.id === activeRuler.sub_id) ? activeRuler.sub_id : ''}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => handleLinkRulerToSub(activeRuler.id, e.target.value || undefined)}
                    className="h-8 max-w-[140px] text-[11px] border border-[#b07840] rounded bg-white text-[#3d2b1f] px-1"
                  >
                    <option value="">{t('ruler.noLink')}</option>
                    {subPatterns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setEditingRulerId((v) => (v === activeRuler.id ? null : activeRuler.id))}
                  title={t('ruler.rename')}
                  aria-label={t('ruler.rename')}
                  aria-pressed={editingRulerId === activeRuler.id}
                  className={`flex items-center justify-center w-8 h-8 rounded border border-[#b07840] active:scale-95 select-none ${
                    editingRulerId === activeRuler.id ? 'bg-[#b5541e] text-[#fdf6e8]' : 'bg-[#fdf6e8] text-[#7a5c46] hover:bg-[#ede5cc]'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                {rulers.length > 1 && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => handleDeleteRuler(activeRuler.id)}
                    title={t('ruler.deleteRuler')}
                    aria-label={t('ruler.deleteRuler')}
                    className="flex items-center justify-center w-8 h-8 rounded border border-[#b07840] bg-[#fdf6e8] text-[#9a4318] hover:bg-[#ede5cc] active:scale-95 select-none"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
              {/* Ruler editor: name + color (opened with the pencil button or a long-press on a floating chip) */}
              {editingRulerId === activeRuler.id && (
                <div className="w-full flex items-center gap-2 flex-wrap border-b border-[#d4b896] pb-1.5">
                  <input
                    key={activeRuler.id}
                    type="text"
                    defaultValue={activeRuler.name}
                    maxLength={24}
                    placeholder={t('ruler.namePlaceholder')}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => handleRenameRuler(activeRuler.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditingRulerId(null);
                    }}
                    className="h-8 w-32 text-base sm:text-xs border border-[#b07840] rounded px-2 bg-white text-[#3d2b1f] focus:outline-none focus:border-[#b5541e]"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {RULER_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => handleRecolorRuler(activeRuler.id, c)}
                        aria-label={c}
                        aria-pressed={activeRuler.color === c}
                        className="w-8 h-8 rounded-full border-2 active:scale-90 transition-transform"
                        style={{ background: c, borderColor: activeRuler.color === c ? '#3d2b1f' : '#fdf6e8', boxShadow: '0 0 0 1px #b07840' }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setEditingRulerId(null)}
                    className="ml-auto h-8 px-2.5 rounded border border-[#b07840] bg-[#fdf6e8] text-[10px] font-bold text-[#7a5c46] hover:bg-[#ede5cc]"
                  >{t('ruler.editDone')}</button>
                </div>
              )}
              {/* Row 1 on mobile: Direction + Slant + (mobile close) */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Direction indicator + Rotate button */}
                <div className="flex items-center gap-1.5 flex-shrink-0 border-r border-[#d4b896] pr-2">
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
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#b07840] bg-white text-[#b5541e] text-[9px] font-semibold hover:bg-[#fdf6e8] active:scale-95 transition-all select-none flex-shrink-0"
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {t('ruler.rotate')}
                  </button>
                </div>
                {/* Slant (rotation) controls */}
                <div className="flex items-center gap-1 flex-shrink-0 sm:border-r sm:border-[#d4b896] sm:pr-2">
                  <span className="text-[10px] text-[#7a5c46] font-bold flex-shrink-0">{t('ruler.slant')}</span>
                  <HoldRepeatButton
                    onPressStart={captureHistory}
                    onStep={() => setRulerRotation(r => Math.max(-45, Math.round((r - 0.1) * 10) / 10))}
                    className="flex items-center justify-center w-8 h-8 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none flex-shrink-0"
                  >−</HoldRepeatButton>
                  <input type="range" min={-45} max={45} step={0.1} value={rulerRotation}
                    onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                    onChange={(e) => setRulerRotation(Math.round(Number(e.target.value) * 10) / 10)}
                    className="accent-[#b5541e] cursor-pointer flex-shrink-0" style={{ width: '64px', height: '20px' }} />
                  <HoldRepeatButton
                    onPressStart={captureHistory}
                    onStep={() => setRulerRotation(r => Math.min(45, Math.round((r + 0.1) * 10) / 10))}
                    className="flex items-center justify-center w-8 h-8 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none flex-shrink-0"
                  >+</HoldRepeatButton>
                  <span className="text-[10px] text-[#b5541e] font-mono w-10 text-center flex-shrink-0">{Number(rulerRotation.toFixed(2))}°</span>
                </div>
                {/* Close button — mobile only */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowRulerSettings(false)}
                  className="sm:hidden flex items-center justify-center w-8 h-8 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0 ml-auto"
                  title={t('common.close')}
                >×</button>
              </div>
              {/* Row 2 on mobile / continues inline on desktop: Height slider */}
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (stepMultiplier <= STEP_MULT_MIN) return;
                    setStepMultiplier(m => Math.max(STEP_MULT_MIN, m / 2));
                    const range = sliderViewMax - sliderViewMin;
                    const newRange = Math.max(MIN_VIEW_RANGE, range / 2);
                    const newMin = Math.max(0, Math.min(rulerHeight - newRange / 2, LOG_RULER_MAX - newRange));
                    setSliderViewMin(newMin);
                    setSliderViewMax(newMin + newRange);
                  }}
                  disabled={stepMultiplier <= STEP_MULT_MIN}
                  className="flex items-center justify-center min-w-[36px] h-8 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('ruler.stepHalf')}
                >÷2</button>
                <HoldRepeatButton
                  onPressStart={captureHistory}
                  onStep={() => {
                    const { rulerHeight: rh } = latestRef.current;
                    const newH = Math.max(0, rh - rulerStepRef.current);
                    latestRef.current.rulerHeight = newH;
                    setRulerHeight(newH);
                    const { min, max } = sliderViewRef.current;
                    if (newH <= min && min > 0) {
                      const range = max - min;
                      const nm = Math.max(0, newH - range * 0.25);
                      sliderViewRef.current = { min: nm, max: nm + range };
                      setSliderViewMin(nm);
                      setSliderViewMax(nm + range);
                    }
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none flex-shrink-0"
                  title={t('ruler.heightDecrease')}
                >−</HoldRepeatButton>
                <div className="flex-1 min-w-0 flex flex-col" style={{ gap: '1px' }}>
                  <input
                    type="range" min={0} max={10000} step={1}
                    value={Math.round(Math.max(0, Math.min(10000,
                      (rulerHeight - sliderViewMin) / (sliderViewMax - sliderViewMin) * 10000
                    )))}
                    onPointerDown={(e) => { e.stopPropagation(); captureHistory(); }}
                    onChange={(e) => {
                      setIsAdjustingRuler(true);
                      setRulerHeight(Math.min(LOG_RULER_MAX, Math.max(0,
                        sliderViewMin + Number(e.target.value) / 10000 * (sliderViewMax - sliderViewMin)
                      )));
                    }}
                    onPointerUp={() => setIsAdjustingRuler(false)}
                    onPointerCancel={() => setIsAdjustingRuler(false)}
                    className="accent-[#b5541e] cursor-pointer w-full"
                    style={{ height: '20px' }}
                  />
                  {/* Tick scale + range labels + overview bar — all in one SVG */}
                  {(() => {
                    const fmtV = (v: number) => v === 0 ? '0' : v < 0.001 ? v.toExponential(1) : v < 0.1 ? v.toFixed(3) : v < 1 ? v.toFixed(2) : v.toFixed(1);
                    const viewPct = (v: number) => Math.max(0, Math.min(100, v / LOG_RULER_MAX * 100));
                    return (
                      <>
                      <div className="sm:hidden text-center text-[11px] font-bold text-[#b5541e] font-mono leading-tight py-0.5">
                        {fmtV(rulerHeight)}% · ±{Number(rulerStepPx.toFixed(2))}px
                      </div>
                      <div className="hidden sm:block">
                      <svg width="100%" height="22" style={{ display: 'block', overflow: 'visible' }}>
                        {Array.from({ length: 11 }, (_, i) => (
                          <line key={`mj${i}`} x1={`${i * 10}%`} x2={`${i * 10}%`} y1={0} y2={7} stroke="#b07840" strokeWidth={0.9} />
                        ))}
                        {Array.from({ length: 51 }, (_, i) => {
                          if (i % 5 === 0) return null;
                          return <line key={`mn${i}`} x1={`${i * 2}%`} x2={`${i * 2}%`} y1={0} y2={3} stroke="#d4b896" strokeWidth={0.5} />;
                        })}
                        <text x="1" y="15" fontSize="6" fill="#7a5c46" fontFamily="monospace">{fmtV(sliderViewMin)}%</text>
                        <text x="50%" y="15" fontSize="6" fill="#b5541e" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {fmtV(rulerHeight)}% · ±{Number(rulerStepPx.toFixed(2))}px
                        </text>
                        <text x="99%" y="15" fontSize="6" fill="#7a5c46" fontFamily="monospace" textAnchor="end">{fmtV(sliderViewMax)}%</text>
                        <rect x="0" y="18" width="100%" height="3" fill="#e8d8c0" rx="1.5" />
                        <rect
                          x={`${viewPct(sliderViewMin)}%`} y="17.5"
                          width={`${Math.max(0.5, viewPct(sliderViewMax) - viewPct(sliderViewMin))}%`}
                          height="4" fill="#b07840" opacity="0.55" rx="1"
                        />
                        <line
                          x1={`${viewPct(rulerHeight)}%`} x2={`${viewPct(rulerHeight)}%`}
                          y1="16.5" y2="21.5" stroke="#b5541e" strokeWidth="1.5"
                        />
                      </svg>
                      </div>
                      </>
                    );
                  })()}
                </div>
                <HoldRepeatButton
                  onPressStart={captureHistory}
                  onStep={() => {
                    const { rulerHeight: rh } = latestRef.current;
                    const newH = Math.min(LOG_RULER_MAX, rh + rulerStepRef.current);
                    latestRef.current.rulerHeight = newH;
                    setRulerHeight(newH);
                    const { min, max } = sliderViewRef.current;
                    if (newH >= max && max < LOG_RULER_MAX) {
                      const range = max - min;
                      const nx = Math.min(LOG_RULER_MAX, newH + range * 0.25);
                      sliderViewRef.current = { min: Math.max(0, nx - range), max: nx };
                      setSliderViewMax(nx);
                      setSliderViewMin(Math.max(0, nx - range));
                    }
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#b07840] bg-white text-[#b5541e] font-bold text-base hover:bg-[#fdf6e8] active:scale-95 select-none leading-none flex-shrink-0"
                  title={t('ruler.heightIncrease')}
                >+</HoldRepeatButton>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (stepMultiplier >= STEP_MULT_MAX) return;
                    setStepMultiplier(m => Math.min(STEP_MULT_MAX, m * 2));
                    const range = sliderViewMax - sliderViewMin;
                    const newRange = Math.min(LOG_RULER_MAX, range * 2);
                    const newMin = Math.max(0, Math.min(rulerHeight - newRange / 2, LOG_RULER_MAX - newRange));
                    setSliderViewMin(newMin);
                    setSliderViewMax(newMin + newRange);
                  }}
                  disabled={stepMultiplier >= STEP_MULT_MAX}
                  className="flex items-center justify-center min-w-[36px] h-8 rounded border border-[#b07840] bg-[#fdf6e8] text-[#7a5c46] text-[10px] font-bold hover:bg-[#ede5cc] active:scale-95 select-none leading-none flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('ruler.stepDouble')}
                >×2</button>
                {/* Close button — desktop only */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowRulerSettings(false)}
                  className="hidden sm:flex items-center justify-center w-8 h-8 rounded-full bg-[#e8d8c0] text-[#7a5c46] text-sm font-bold hover:bg-[#d4b896] active:scale-95 select-none leading-none flex-shrink-0 ml-1"
                  title={t('common.close')}
                >×</button>
              </div>
            </div>
          );
        })()}


        {/* Floating ruler switcher — one tap switches AND jumps to that ruler */}
        {(!isCrochet || crochetShape === 'line') && showOverlays && !showGuide && !showRulerSettings && imgH > 0
          && (rulers.length > 1 || (subPatterns.length > 1 && rulers.length < MAX_RULERS)) && (
          <div
            className="absolute left-2 sm:left-4 bottom-[122px] sm:bottom-[152px] z-20 flex flex-col items-start gap-1"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {rulers.length > 1 && rulers.map((r) => {
              const isAct = r.id === activeRulerId;
              const linked = r.sub_id ? subPatterns.find((sp) => sp.id === r.sub_id) : undefined;
              return (
                <button
                  key={r.id}
                  type="button"
                  onPointerDown={() => {
                    chipLongPressedRef.current = false;
                    cancelChipPress();
                    chipPressTimerRef.current = setTimeout(() => {
                      chipLongPressedRef.current = true;
                      activateRuler(r.id);
                      setEditingRulerId(r.id);
                      setShowRulerSettings(true);
                    }, 500);
                  }}
                  onPointerUp={cancelChipPress}
                  onPointerLeave={cancelChipPress}
                  onPointerCancel={cancelChipPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => { if (chipLongPressedRef.current) { chipLongPressedRef.current = false; return; } jumpToRuler(r.id); }}
                  title={isAct ? t('viewer.goToRuler').replace('\n', ' ') : t('ruler.tapToActivate')}
                  aria-pressed={isAct}
                  className={`flex items-center gap-1.5 h-8 sm:h-9 pl-1.5 pr-2.5 rounded-full border-2 backdrop-blur-sm shadow-sm text-[10px] sm:text-[11px] font-bold select-none transition-all active:scale-95 ${
                    isAct
                      ? 'bg-[#fdf6e8] text-[#3d2b1f] shadow-md'
                      : 'bg-[#fdf6e8]/75 border-[#b07840]/60 text-[#7a5c46] hover:bg-[#fdf6e8]'
                  }`}
                  style={isAct ? { borderColor: r.color, boxShadow: `0 0 0 2px ${r.color}33, 0 1px 3px rgba(0,0,0,0.2)` } : undefined}
                >
                  <span className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full flex-shrink-0" style={{ background: r.color, boxShadow: '0 0 0 1.5px #fdf6e8' }} />
                  <span className="flex flex-col items-start leading-none gap-0.5">
                    <span>{r.name}</span>
                    {linked && <span className="text-[8px] sm:text-[9px] font-semibold opacity-70 max-w-[72px] truncate">{linked.name} · {linked.current_row}</span>}
                  </span>
                </button>
              );
            })}
            {rulers.length < MAX_RULERS && (
              <button
                type="button"
                onClick={handleAddRuler}
                title={t('ruler.add')}
                aria-label={t('ruler.add')}
                className={`flex items-center justify-center gap-1 h-8 sm:h-9 rounded-full border-2 border-dashed border-[#b07840]/70 bg-[#fdf6e8]/75 backdrop-blur-sm text-[#b5541e] font-bold hover:bg-[#fdf6e8] active:scale-95 select-none leading-none ${
                  rulers.length > 1 ? 'w-8 sm:w-9 text-base' : 'px-3 text-[11px]'
                }`}
              >
                <span className="text-base leading-none">+</span>
                {rulers.length === 1 && <span>{t('ruler.add')}</span>}
              </button>
            )}
          </div>
        )}

        {/* Transient notices live at the bottom center, where the knitter is already looking */}
        {noteToast && (
          <div className="absolute bottom-[88px] sm:bottom-[100px] left-1/2 -translate-x-1/2 max-w-[calc(100%-136px)] sm:max-w-[calc(100%-200px)] z-40 pointer-events-none">
            <div className="flex items-center gap-2 bg-amber-600/90 text-[#fdf6e8] text-xs font-bold px-3.5 py-2 rounded-2xl shadow-lg backdrop-blur-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/></svg>
              <span className="leading-snug">{noteToast}</span>
            </div>
          </div>
        )}
        {motifToast && (
          <div className="absolute bottom-9 sm:bottom-12 left-1/2 -translate-x-1/2 max-w-[calc(100%-136px)] sm:max-w-[calc(100%-200px)] z-40">
            <div className="flex items-center gap-2 bg-[#3d2b1f]/92 text-[#fdf6e8] text-xs font-bold pl-3.5 pr-2 py-1.5 rounded-2xl shadow-lg backdrop-blur-sm">
              <span className="leading-snug">{t('crochet.motifDone', { n: motifToast.n, total: motifToast.total })}</span>
              <button
                type="button"
                onClick={handleNextMotif}
                className="h-8 px-3 rounded-full bg-[#b5541e] text-[#fdf6e8] text-[11px] font-bold hover:bg-[#9a4318] whitespace-nowrap"
              >{t('crochet.nextMotif')}</button>
              <button type="button" onClick={() => setMotifToast(null)} className="w-7 h-7 rounded-full text-[#fdf6e8]/70 hover:text-[#fdf6e8]" aria-label={t('common.close')}>×</button>
            </div>
          </div>
        )}
        {repeatToast && (
          <div className="absolute bottom-9 sm:bottom-12 left-1/2 -translate-x-1/2 max-w-[calc(100%-136px)] sm:max-w-[calc(100%-200px)] z-40 pointer-events-none">
            <div className="flex items-center gap-2 bg-[#3d2b1f]/90 text-[#fdf6e8] text-xs font-bold px-3.5 py-2 rounded-2xl shadow-lg backdrop-blur-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 9A8 8 0 0119 7.3M18.4 15A8 8 0 015 16.7" />
              </svg>
              <span className="leading-snug">{repeatToast}</span>
            </div>
          </div>
        )}

        {hasMarkSelection && showOverlays && completedMarks.length > 1 && !showRulerSettings && (
          <div className="absolute bottom-9 sm:bottom-12 left-1/2 -translate-x-1/2 max-w-[calc(100%-136px)] sm:max-w-[calc(100%-200px)] z-30">
            <button
              onClick={() => {
                if (confirm(t('view.deleteAllMarks'))) {
                  handleCompletedMarkDeleteAll();
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-[#9a4318]/90 text-[#fdf6e8] rounded-full hover:bg-[#9a4318] transition-colors shadow-md border border-[#7a3310]"
            >
              {t('view.deleteAll')}
            </button>
          </div>
        )}
      </div>
      {/* Side-by-side: a second, read-only viewer for another file (desktop) */}
      {splitIdx != null && !isLandscapePhone && allFiles[splitIdx] && (
        <div className="hidden lg:flex w-[42%] min-w-0 flex-col border-l-2 border-[#b07840] bg-[#f5edd6]">
          <div className="flex items-center gap-2 px-2 py-1 border-b border-[#d4b896]">
            <span className="text-[10px] font-bold text-[#7a5c46]">{t('view.secondFile')}</span>
            <select
              value={splitIdx}
              onChange={(e) => setSplitIdx(Number(e.target.value))}
              className="h-7 text-xs border border-[#b07840] rounded bg-white text-[#3d2b1f] px-1 max-w-[60%]"
            >
              {allFiles.map((f, i) => (
                <option key={i} value={i}>{(pattern.image_names?.[i] && pattern.image_names[i] !== '') ? pattern.image_names[i] : t('form.imageN').replace('{n}', String(i + 1))}</option>
              ))}
            </select>
            <button onClick={() => setSplitIdx(null)} className="ml-auto w-7 h-7 rounded-full text-[#7a5c46] hover:bg-[#ede5cc]" aria-label={t('view.sideBySideOff')}>×</button>
          </div>
          <div className="flex-1 relative min-h-0 p-1 sm:p-2">
            <PatternViewer key={`split-${splitIdx}`} fileUrl={allFiles[splitIdx].url} fileType={allFiles[splitIdx].file_type ?? pattern.file_type} />
          </div>
        </div>
      )}
      </div>

      {/* Bottom controls — compact single row + collapsible notes (a right-side rail on landscape phones) */}
      <div className={isLandscapePhone
        ? 'bg-[#fdf6e8] border-l-2 border-[#b07840] shrink-0 w-[150px] flex flex-col overflow-y-auto safe-right'
        : 'bg-[#fdf6e8] border-t-2 border-[#b07840] shrink-0 safe-bottom'}>
        {/* Single control row: SubPattern | slim progress bar | counter | markers */}
        <div
          className={`px-2 sm:px-3 py-1.5 flex ${isLandscapePhone ? 'flex-col items-stretch' : 'items-center'} gap-1.5 sm:gap-2 transition-all ${showSubPatternGuide ? 'animate-pulse' : ''}`}
          style={showSubPatternGuide ? { outline: '2px dashed #b5541e', outlineOffset: '2px' } : {}}
        >
          <SubPatternSelector
            subPatterns={subPatterns}
            activeId={activeSubId}
            isCrochet={isCrochet}
            initialExpanded={showSubPatternGuide}
            onSelect={handleSelectSub}
            onAdd={handleAddSubPattern}
            onUpdate={handleUpdateSubPattern}
            onDelete={handleDeleteSubPattern}
          />

          {/* Complete button — prominent, fills the flex-1 space formerly used by the progress bar */}
          <button
            onClick={() => {
              if (completeLongPressedRef.current) { completeLongPressedRef.current = false; return; }
              if (!isCrochet || crochetShape === 'line') handleComplete(); else handleCrochetCircleComplete();
            }}
            onPointerDown={() => {
              if (!(isCrochet && crochetShape !== 'line' && crochetShape !== 'rect')) return;
              completeLongPressedRef.current = false;
              if (completePressTimerRef.current) clearTimeout(completePressTimerRef.current);
              completePressTimerRef.current = setTimeout(() => { completeLongPressedRef.current = true; handleCrochetHalfRound(); }, 550);
            }}
            onPointerUp={() => { if (completePressTimerRef.current) { clearTimeout(completePressTimerRef.current); completePressTimerRef.current = null; } }}
            onPointerLeave={() => { if (completePressTimerRef.current) { clearTimeout(completePressTimerRef.current); completePressTimerRef.current = null; } }}
            onPointerCancel={() => { if (completePressTimerRef.current) { clearTimeout(completePressTimerRef.current); completePressTimerRef.current = null; } }}
            onContextMenu={(e) => { if (isCrochet && crochetShape !== 'line') e.preventDefault(); }}
            className="flex-1 min-w-0 flex items-center justify-center gap-2 h-11 text-sm font-bold tracking-wide bg-[#b5541e] text-[#fdf6e8] rounded-lg border-2 border-[#9a4318] hover:bg-[#9a4318] active:scale-[0.97] transition-all shadow-[3px_3px_0_#9a4318]"
            title={isCrochet && crochetShape !== 'line' && crochetShape !== 'rect' ? t('crochet.halfRoundHint') : t('ruler.complete')}
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="truncate">{t('ruler.complete')}</span>
          </button>

          {/* Row/round counter */}
          <RowCounter
            current={activeSub?.current_row || 0}
            total={activeSub?.total_rows || 1}
            onChange={handleRowChange}
            repeatLabel={repeatLabel}
            repeatLabelShort={repeatLabelShort}
          />

          {/* Marker button(s) */}
          {(() => {
            const markerCount = isCrochet ? crochetMarks.length : knittingMarks.length;
            const isPlacing = isCrochet ? isPlacingMarker : isPlacingKnittingMarker;
            const onPlace = isCrochet ? () => setIsPlacingMarker(true) : () => setIsPlacingKnittingMarker(true);
            const onDeleteAll = isCrochet ? () => { if (confirm(t('marker.deleteConfirm'))) handleCrochetMarkDeleteAll(); } : () => { if (confirm(t('marker.deleteConfirm'))) handleKnittingMarkDeleteAll(); };
            return (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onPlace}
                  disabled={isPlacing}
                  className="flex items-center gap-1 px-2 py-1.5 h-11 text-[11px] font-bold tracking-wide bg-[#b5541e] text-[#fdf6e8] rounded-lg border-2 border-[#9a4318] hover:bg-[#9a4318] disabled:opacity-50 transition-colors shadow-[3px_3px_0_#9a4318]"
                  title={t('marker.place')}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {markerCount > 0 && <span>{markerCount}</span>}
                </button>
                {markerCount > 0 && (
                  <button
                    onClick={onDeleteAll}
                    className="flex items-center justify-center w-9 h-9 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                    title={t('marker.deleteTitle')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Stitch counter (optional second row) */}
        {showStitchCounter && activeSub && (
          <div className={`px-2 sm:px-3 pb-1 flex ${isLandscapePhone ? 'flex-col items-stretch' : 'items-center flex-wrap'} gap-2`}>
            <StitchCounter
              count={activeSub.stitch_count ?? 0}
              onChange={(n) => updateActiveSub((su) => ({ ...su, stitch_count: Math.max(0, n) }))}
            />
            <label className="flex items-center gap-1.5 text-[10px] text-[#7a5c46] font-semibold select-none min-h-[32px]">
              <input
                type="checkbox"
                className="accent-[#b5541e] w-3.5 h-3.5"
                checked={!!activeSub.stitch_reset_on_row}
                onChange={(e) => updateActiveSub((su) => ({ ...su, stitch_reset_on_row: e.target.checked }))}
              />
              {t('counter.stitchResetOnRow')}
            </label>
            <button
              type="button"
              onClick={() => updateActiveSub((su) => ({ ...su, stitch_count: 0 }))}
              className="h-8 px-2.5 rounded-lg border border-[#b07840] bg-[#f5edd6] text-[10px] font-bold text-[#7a5c46] hover:bg-[#ede5cc]"
            >{t('counter.stitchReset')}</button>
          </div>
        )}

        {/* Notes — collapsible, scrollable */}
        <div className={`px-2 sm:px-3 pb-1.5 sm:pb-2 overflow-y-auto ${isLandscapePhone ? 'flex-1 min-h-0' : 'max-h-[28vh] sm:max-h-[20vh]'}`}>
          <PatternNotes
            currentRow={activeSub?.current_row || 0}
            activeSubPattern={activeSub || subPatterns[0]}
            subPatterns={subPatterns}
            notes={notes}
            notePositions={notePositions}
            onUpdate={handleNotesUpdate}
            onDelete={handleNoteDelete}
            onPlaceNote={setPlacingNoteKey}
            hasRowNotes={hasRowNotes}
          />
        </div>
      </div>
      </div>

      <HelpSheet
        open={showHelp}
        onClose={() => setShowHelp(false)}
        isCrochetRound={isCrochet && crochetShape !== 'line'}
        followRuler={followRuler}
        onToggleFollowRuler={toggleFollowRuler}
        viewLocked={viewLocked}
        onToggleViewLock={toggleViewLock}
        showStitchCounter={showStitchCounter}
        onToggleStitchCounter={toggleStitchCounter}
        textSize={textSize}
        onTextSize={changeTextSize}
        session={sessionStats}
        onReplayGuide={handleReplayGuide}
        onShareImage={handleShareImage}
        onBackup={handleBackup}
        exporting={exporting}
      />
    </div>
  );
}
