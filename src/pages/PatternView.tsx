import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress, CompletedMark, RulerDirection, NotePosition, SubPattern, CrochetMark, KnittingMark } from '@/lib/types';
import PatternViewer, { type PatternViewerHandle } from '@/components/PatternViewer';
import RowRuler from '@/components/RowRuler';
import CompletedOverlay from '@/components/CompletedOverlay';
import CrochetMarkers from '@/components/CrochetMarkers';
import KnittingMarkers from '@/components/KnittingMarkers';
import NoteBubbles from '@/components/NoteBubbles';
import SubPatternSelector from '@/components/SubPatternSelector';
import RowCounter from '@/components/RowCounter';
import StitchCounter from '@/components/StitchCounter';
import PatternNotes from '@/components/PatternNotes';
import ProgressBar from '@/components/ProgressBar';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useWakeLock } from '@/hooks/useWakeLock';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultSubPattern(index: number): SubPattern {
  return {
    id: generateId(),
    name: `도안 ${index}`,
    total_rows: 1,
    current_row: 0,
    stitch_count: 0,
  };
}

export default function PatternView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState<PatternWithProgress | null>(null);
  const [loading, setLoading] = useState(true);

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
        navigate('/dashboard');
        return;
      }

      setPattern({
        ...queryResult.data,
        progress: queryResult.data.progress?.[0] || null,
      } as PatternWithProgress);
      setLoading(false);
    });
  }, [id, navigate]);

  if (loading || !pattern) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#b5541e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <PatternViewerPage pattern={pattern} />;
}

interface Props {
  pattern: PatternWithProgress;
}

type Snapshot = {
  subPatterns: SubPattern[];
  activeSubId: string;
  rulerY: number;
  rulerHeight: number;
  rulerDirection: RulerDirection;
  completedMarks: CompletedMark[];
  crochetMarks: CrochetMark[];
  knittingMarks: KnittingMark[];
};

const MAX_HISTORY = 20;

function PatternViewerPage({ pattern }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const viewerRef = useRef<PatternViewerHandle>(null);
  const { request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  const isCrochet = pattern.type === 'crochet';

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
      name: '도안 1',
      total_rows: pattern.total_rows || 1,
      current_row: pattern.progress?.current_row || 0,
      stitch_count: pattern.progress?.stitch_count || 0,
    }];
  };

  const [subPatterns, setSubPatterns] = useState<SubPattern[]>(initSubPatterns);
  const [activeSubId, setActiveSubId] = useState<string>(
    (pattern.progress?.active_sub_pattern_id as string) || subPatterns[0]?.id || ''
  );

  const activeSub = subPatterns.find((s) => s.id === activeSubId) || subPatterns[0];

  // Ruler stored in CONTENT coordinates (% of pattern, not screen)
  const [rulerY, setRulerY] = useState(pattern.progress?.ruler_position_y || 50);
  const [rulerHeight, setRulerHeight] = useState(Math.min(pattern.progress?.ruler_height || 0.3, 0.3));
  const [rulerDirection, setRulerDirection] = useState<RulerDirection>(
    (pattern.progress?.ruler_direction as RulerDirection) || 'up'
  );
  const [completedMarks, setCompletedMarks] = useState<CompletedMark[]>(
    (pattern.progress?.completed_marks as CompletedMark[]) || []
  );
  const [hasMarkSelection, setHasMarkSelection] = useState(false);
  const [isAdjustingRuler, setIsAdjustingRuler] = useState(false);
  const [showRulerSettings, setShowRulerSettings] = useState(false);

  // Current viewer transform — updated every frame during pan/zoom
  const [viewTransform, setViewTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [containerH, setContainerH] = useState(600);
  const [containerW, setContainerW] = useState(600);
  // Rendered image size in CSS px (at scale=1). 0 = not yet measured.
  const [imgH, setImgH] = useState(0);
  const [imgW, setImgW] = useState(0);

  // Scroll to ruler on first image load if ruler position was saved
  const initialScrollDoneRef = useRef(false);
  const hasSavedRulerPosition = pattern.progress?.ruler_position_y != null;

  const handleImageSize = useCallback((w: number, h: number) => {
    setImgW(w);
    setImgH(h);
    if (!initialScrollDoneRef.current && h > 0 && hasSavedRulerPosition) {
      initialScrollDoneRef.current = true;
      const { rulerY: ry, rulerHeight: rh } = latestRef.current;
      requestAnimationFrame(() => {
        viewerRef.current?.scrollToContentY(ry + rh / 2);
      });
    }
  }, [hasSavedRulerPosition]);

  // Ref for stable callbacks that need latest transform/ruler values
  const latestRef = useRef({ rulerY, rulerHeight, viewTransform, containerH, containerW, imgH, imgW });
  useEffect(() => {
    latestRef.current = { rulerY, rulerHeight, viewTransform, containerH, containerW, imgH, imgW };
  }, [rulerY, rulerHeight, viewTransform, containerH, containerW, imgH, imgW]);

  const handleTransformChange = useCallback(
    (t: { scale: number; x: number; y: number }, H: number, W: number) => {
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
    completedMarks,
    crochetMarks: [],
    knittingMarks: [],
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
    setCompletedMarks(snap.completedMarks);
    setCrochetMarks(snap.crochetMarks);
    setKnittingMarks(snap.knittingMarks);
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

  // Convert screen % → image-relative %
  const screenToContentY = (screenPct: number, t = viewTransform, H = containerH, iH = imgH) => {
    const screenY = (screenPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    if (iH > 0) return ((contentY - (H - iH) / 2) / iH) * 100;
    return (contentY / H) * 100;
  };

  // Screen positions for RowRuler display (derived, not stored)
  const screenRulerY = contentToScreenY(rulerY);
  const screenRulerHeight = imgH > 0
    ? (rulerHeight / 100) * imgH * viewTransform.scale / containerH * 100
    : rulerHeight * viewTransform.scale;

  // When RowRuler reports drag (screen coords) → convert to image-relative coords
  const handleRulerPositionChange = useCallback((screenYPct: number) => {
    const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
    const screenY = (screenYPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    // No clamp: RowRuler already clamps to screen-space [0, 100-height].
    // Clamping here causes the ruler to snap to the image edge when dragged
    // into letterbox areas, making the UI appear broken.
    setRulerY(iH > 0 ? ((contentY - (H - iH) / 2) / iH) * 100 : (contentY / H) * 100);
  }, []);

  const handleRulerHeightChange = useCallback((screenHPct: number) => {
    const { viewTransform: t, containerH: H, imgH: iH } = latestRef.current;
    const contentH_px = (screenHPct / 100) * H / t.scale;
    const refH = iH > 0 ? iH : H;
    setRulerHeight(Math.min(0.3, Math.max(0.001, (contentH_px / refH) * 100)));
  }, []);

  const [crochetMarks, setCrochetMarks] = useState<CrochetMark[]>(
    (pattern.progress?.crochet_marks as CrochetMark[]) || []
  );
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);

  const [knittingMarks, setKnittingMarks] = useState<KnittingMark[]>(
    (pattern.progress?.knitting_marks as KnittingMark[]) || []
  );
  const [isPlacingKnittingMarker, setIsPlacingKnittingMarker] = useState(false);

  // Keep undoStateRef in sync with all undoable state
  useEffect(() => {
    undoStateRef.current = { subPatterns, activeSubId, rulerY, rulerHeight, rulerDirection, completedMarks, crochetMarks, knittingMarks };
  }, [subPatterns, activeSubId, rulerY, rulerHeight, rulerDirection, completedMarks, crochetMarks, knittingMarks]);

  const [notes, setNotes] = useState<Record<string, string>>(
    (pattern.progress?.notes as Record<string, string>) || {}
  );
  const [notePositions, setNotePositions] = useState<Record<string, NotePosition>>(
    (pattern.progress?.note_positions as Record<string, NotePosition>) || {}
  );
  const [prevRow, setPrevRow] = useState(activeSub?.current_row || 0);

  const updateActiveSub = useCallback((updater: (sub: SubPattern) => SubPattern) => {
    setSubPatterns((prev) =>
      prev.map((s) => (s.id === activeSubId ? updater(s) : s))
    );
  }, [activeSubId]);

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) userIdRef.current = session.user.id;
    });
  }, [supabase]);

  const saveFn = useCallback(
    async (data: Record<string, unknown>) => {
      let uid = userIdRef.current;
      if (!uid) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        uid = session.user.id;
        userIdRef.current = uid;
      }

      await supabase
        .from('pattern_progress')
        .upsert(
          {
            pattern_id: pattern.id,
            user_id: uid,
            ...data,
          },
          { onConflict: 'pattern_id,user_id' }
        );
    },
    [supabase, pattern.id]
  );

  const { save, status } = useAutoSave(saveFn);

  useEffect(() => {
    save({
      current_row: activeSub?.current_row || 0,
      stitch_count: activeSub?.stitch_count || 0,
      ruler_position_y: rulerY,
      ruler_height: rulerHeight,
      ruler_direction: rulerDirection,
      completed_marks: completedMarks,
      crochet_marks: crochetMarks,
      knitting_marks: knittingMarks,
      notes,
      note_positions: notePositions,
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
    });
  }, [activeSub, rulerY, rulerHeight, rulerDirection, completedMarks, crochetMarks, knittingMarks, notes, notePositions, subPatterns, activeSubId, save]);

  const handleRowChange = (row: number) => {
    captureHistory();
    if (row !== prevRow) {
      updateActiveSub((s) => ({ ...s, stitch_count: 0 }));
      setPrevRow(row);
    }
    updateActiveSub((s) => ({ ...s, current_row: row }));
  };

  const handleStitchChange = (count: number) => {
    captureHistory();
    updateActiveSub((s) => ({ ...s, stitch_count: count }));
  };

  const handleNotesUpdate = useCallback(
    (updatedNotes: Record<string, string>) => {
      setNotes(updatedNotes);
      setNotePositions((prev) => {
        const next = { ...prev };
        let changed = false;
        const { rulerY: ry, rulerHeight: rh } = latestRef.current;
        for (const key of Object.keys(updatedNotes)) {
          if (!next[key]) {
            // rulerY/rulerHeight are already content coords
            next[key] = { x: 90, y: ry + rh / 2 };
            changed = true;
          }
        }
        for (const key of Object.keys(next)) {
          if (!updatedNotes[key]) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    []
  );

  const handleComplete = useCallback(() => {
    captureHistory();
    const { rulerY: ry, rulerHeight: rh } = latestRef.current;
    const newMark: CompletedMark = { y: ry, height: rh };

    setCompletedMarks((prev) => [...prev, newMark]);
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1, stitch_count: 0 }));

    if (rulerDirection === 'up') {
      setRulerY(ry - rh);
    } else {
      setRulerY(ry + rh);
    }
  }, [captureHistory, rulerDirection, updateActiveSub]);

  // Convert screen % → content % for marker placement (markers now outside CSS transform)
  const screenToContent = useCallback((screenX: number, screenY: number) => {
    const { viewTransform: t, containerH: H, containerW: W } = latestRef.current;
    const sx = (screenX / 100) * W;
    const sy = (screenY / 100) * H;
    return {
      x: ((sx - W / 2 - t.x) / t.scale + W / 2) / W * 100,
      y: ((sy - H / 2 - t.y) / t.scale + H / 2) / H * 100,
    };
  }, []);

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
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1, stitch_count: 0 }));
    setIsPlacingMarker(false);
  }, [captureHistory, activeSub, updateActiveSub, screenToContent]);

  // CompletedOverlay is rendered outside the CSS transform (screen space),
  // so its y/height values are in screen % — convert back to content % on update.
  const handleCompletedMarkUpdate = useCallback((index: number, screenMark: CompletedMark) => {
    const { viewTransform: t, containerH: H } = latestRef.current;
    const screenY = (screenMark.y / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    setCompletedMarks((prev) => prev.map((m, i) =>
      i === index ? { y: (contentY / H) * 100, height: screenMark.height / t.scale } : m
    ));
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
    const newSub = createDefaultSubPattern(subPatterns.length + 1);
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

  // On first load, scroll the viewer so the ruler is visible at screen center
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (initialScrollDone.current || containerH <= 1 || isCrochet) return;
    initialScrollDone.current = true;
    viewerRef.current?.scrollToContentY(rulerY + rulerHeight / 2);
  // Only trigger when containerH becomes available (real height after mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerH]);

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
    const contentY = (m.y / 100) * containerH;
    const screenY = (contentY - containerH / 2) * viewTransform.scale + containerH / 2 + viewTransform.y;
    return { y: (screenY / containerH) * 100, height: m.height * viewTransform.scale };
  });

  return (
    <div className="flex flex-col h-screen bg-[#f5edd6]">
      {/* Top bar */}
      <div className="bg-[#f5edd6] border-b-2 border-[#d4b896] px-2 sm:px-4 py-2 flex items-center justify-between shrink-0 safe-top">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link to="/dashboard" className="text-[#a08060] hover:text-[#3d2b1f] shrink-0 p-1 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-[#3d2b1f] truncate text-sm sm:text-base tracking-tight">{pattern.title}</h1>
              <span className="text-[9px] font-bold tracking-widest uppercase bg-[#3d2b1f] text-[#fdf6e8] px-2 py-0.5 rounded shrink-0">
                {isCrochet ? '코바늘' : '대바늘'}
              </span>
            </div>
            {(pattern.yarn || pattern.needle) && (
              <p className="text-[11px] text-[#a08060] truncate mt-0.5">
                {[pattern.yarn, pattern.needle].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#d4b896] disabled:opacity-25 transition-colors"
            title="되돌리기 (Ctrl+Z)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7a5c46] hover:bg-[#ede5cc] active:bg-[#d4b896] disabled:opacity-25 transition-colors"
            title="다시 실행 (Ctrl+Shift+Z)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 relative min-h-0 p-1 sm:p-2">
        <PatternViewer
          ref={viewerRef}
          fileUrl={pattern.file_url}
          fileType={pattern.file_type}
          rulerYPercent={rulerY + rulerHeight / 2}
          onTransformChange={handleTransformChange}
          onImageSize={handleImageSize}
          onResetRuler={!isCrochet ? () => {
            const { viewTransform: t, containerH: H, imgH: iH, rulerHeight: rh } = latestRef.current;
            // Content Y (container px) that is currently at screen center
            const contentY = H / 2 - t.y / t.scale;
            // Convert to image-relative % (same logic as screenToContentY)
            const refH = iH > 0 ? iH : H;
            const offset = iH > 0 ? (H - iH) / 2 : 0;
            setRulerY((contentY - offset) / refH * 100 - rh / 2);
          } : undefined}
          contentOverlay={
            <NoteBubbles
              notes={notes}
              positions={notePositions}
              onPositionChange={handleNotePositionChange}
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
          {!isCrochet && (
            <CompletedOverlay
              marks={screenCompletedMarks}
              onUpdate={handleCompletedMarkUpdate}
              onDelete={handleCompletedMarkDelete}
              onDeleteAll={handleCompletedMarkDeleteAll}
              onSelectionChange={setHasMarkSelection}
              onDragStart={captureHistory}
            />
          )}
          {!isCrochet && (
            <RowRuler
              positionY={screenRulerY}
              height={screenRulerHeight}
              direction={rulerDirection}
              isAdjusting={isAdjustingRuler}
              isPlacingMarker={isPlacingKnittingMarker}
              showSettings={showRulerSettings}
              onChangePosition={handleRulerPositionChange}
              onChangeHeight={handleRulerHeightChange}
              onComplete={handleComplete}
              onToggleDirection={() => { captureHistory(); setRulerDirection((d) => (d === 'up' ? 'down' : 'up')); }}
              onToggleSettings={() => setShowRulerSettings((v) => !v)}
              onDragStart={captureHistory}
            />
          )}
        </PatternViewer>

        {/* Ruler settings floating panel — opposite side of direction */}
        {showRulerSettings && !isCrochet && (
          <div
            className="absolute z-30 bg-[#fdf6e8]/96 backdrop-blur-sm rounded-xl border-2 border-[#d4b896] shadow-[3px_3px_0_#d4b896] px-3 py-2.5"
            style={
              rulerDirection === 'up'
                ? { top: `calc(${screenRulerY + screenRulerHeight}% + 8px)`, left: 'clamp(108px, 30vw, 148px)', right: '60px' }
                : { top: `calc(${screenRulerY}% - 8px)`, left: 'clamp(108px, 30vw, 148px)', right: '60px', transform: 'translateY(-100%)' }
            }
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#b5541e] whitespace-nowrap">높이</span>
              <input
                type="range"
                min={0}
                max={10000}
                step={1}
                value={Math.round(rulerHeight / 0.3 * 10000)}
                onPointerDown={captureHistory}
                onChange={(e) => {
                  setIsAdjustingRuler(true);
                  setRulerHeight(Math.max(0.001, Number(e.target.value) / 10000 * 0.3));
                }}
                onPointerUp={() => setIsAdjustingRuler(false)}
                onMouseUp={() => setIsAdjustingRuler(false)}
                onTouchEnd={() => setIsAdjustingRuler(false)}
                className="flex-1 min-w-0 h-1.5 accent-[#b5541e] cursor-pointer"
              />
              <span className="text-[11px] text-[#b5541e] font-mono w-12 text-right shrink-0">
                {(rulerHeight / 0.3 * 100).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {!isCrochet && hasMarkSelection && completedMarks.length > 1 && (
          <div className="absolute top-4 right-4 z-30">
            <button
              onClick={() => {
                if (confirm('모든 완료 표시를 삭제하시겠습니까?')) {
                  setCompletedMarks([]);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium bg-red-500/90 text-white rounded-full hover:bg-red-600 transition-colors shadow-md"
            >
              전체 삭제
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-[#fdf6e8] border-t-2 border-[#d4b896] px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 shrink-0 safe-bottom overflow-y-auto max-h-[52vh] sm:max-h-[45vh]">
        <div className="flex items-center gap-2 sm:gap-3">
          <SubPatternSelector
            subPatterns={subPatterns}
            activeId={activeSubId}
            isCrochet={isCrochet}
            onSelect={setActiveSubId}
            onAdd={handleAddSubPattern}
            onUpdate={handleUpdateSubPattern}
            onDelete={handleDeleteSubPattern}
          />
          <div className="flex-1">
            <ProgressBar current={activeSub?.current_row || 0} total={activeSub?.total_rows || 1} />
          </div>
        </div>

        {isCrochet ? (
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRowChange(Math.max(0, (activeSub?.current_row || 0) - 1))}
                disabled={(activeSub?.current_row || 0) <= 0}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg border-2 border-[#d4b896] bg-[#f5edd6] text-[#7a5c46] text-sm font-bold flex items-center justify-center hover:border-[#b5541e] hover:text-[#b5541e] disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <div className="text-center min-w-[45px] sm:min-w-[50px]">
                <div className="text-lg sm:text-xl font-bold text-[#3d2b1f]">{activeSub?.current_row || 0}</div>
                <div className="text-[10px] text-[#a08060] tracking-wide">/ {activeSub?.total_rows || 1}단</div>
              </div>
              <button
                onClick={() => handleRowChange((activeSub?.current_row || 0) + 1)}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg border-2 border-[#9a4318] bg-[#b5541e] text-[#fdf6e8] text-sm font-bold flex items-center justify-center hover:bg-[#9a4318] transition-colors shadow-[2px_2px_0_#9a4318]"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsPlacingMarker(true)}
                disabled={isPlacingMarker}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs font-bold tracking-wide bg-[#b5541e] text-[#fdf6e8] rounded-lg border-2 border-[#9a4318] hover:bg-[#9a4318] disabled:opacity-50 transition-colors shadow-[2px_2px_0_#9a4318]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">마커</span> ({crochetMarks.length})
              </button>
              {crochetMarks.length > 0 && (
                <button
                  onClick={() => { if (confirm('모든 마커를 삭제하시겠습니까?')) handleCrochetMarkDeleteAll(); }}
                  className="flex items-center justify-center w-10 h-10 min-h-[44px] rounded-lg border-2 border-[#d4b896] bg-[#f5edd6] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                  title="마커 전체 삭제"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <RowCounter
              current={activeSub?.current_row || 0}
              total={activeSub?.total_rows || 1}
              onChange={handleRowChange}
            />
            <StitchCounter count={activeSub?.stitch_count || 0} onChange={handleStitchChange} />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsPlacingKnittingMarker(true)}
                disabled={isPlacingKnittingMarker}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[44px] text-xs font-bold tracking-wide bg-[#8b6b4a] text-[#fdf6e8] rounded-lg border-2 border-[#6b4f36] hover:bg-[#6b4f36] disabled:opacity-50 transition-colors shadow-[2px_2px_0_#6b4f36]"
                title="마커 배치"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">마커</span>
                {knittingMarks.length > 0 && <span>({knittingMarks.length})</span>}
              </button>
              {knittingMarks.length > 0 && (
                <button
                  onClick={() => { if (confirm('모든 마커를 삭제하시겠습니까?')) handleKnittingMarkDeleteAll(); }}
                  className="flex items-center justify-center w-10 h-10 min-h-[44px] rounded-lg border-2 border-[#d4b896] bg-[#f5edd6] text-[#a08060] hover:border-[#b5541e] hover:text-[#b5541e] transition-colors"
                  title="마커 전체 삭제"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <PatternNotes
          currentRow={activeSub?.current_row || 0}
          activeSubPattern={activeSub || subPatterns[0]}
          subPatterns={subPatterns}
          notes={notes}
          onUpdate={handleNotesUpdate}
        />
      </div>
    </div>
  );
}
