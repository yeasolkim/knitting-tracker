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
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <PatternViewerPage pattern={pattern} />;
}

interface Props {
  pattern: PatternWithProgress;
}

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
  const [rulerHeight, setRulerHeight] = useState(Math.min(pattern.progress?.ruler_height || 5, 10));
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

  // Ref for stable callbacks that need latest transform/ruler values
  const latestRef = useRef({ rulerY, rulerHeight, viewTransform, containerH, containerW });
  useEffect(() => {
    latestRef.current = { rulerY, rulerHeight, viewTransform, containerH, containerW };
  }, [rulerY, rulerHeight, viewTransform, containerH, containerW]);

  const handleTransformChange = useCallback(
    (t: { scale: number; x: number; y: number }, H: number, W: number) => {
      setViewTransform(t);
      setContainerH(H);
      setContainerW(W);
    },
    []
  );

  // Convert content % → screen % using current transform
  const contentToScreenY = (contentPct: number, t = viewTransform, H = containerH) => {
    const contentY = (contentPct / 100) * H;
    const screenY = (contentY - H / 2) * t.scale + H / 2 + t.y;
    return (screenY / H) * 100;
  };

  // Convert screen % → content %
  const screenToContentY = (screenPct: number, t = viewTransform, H = containerH) => {
    const screenY = (screenPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    return (contentY / H) * 100;
  };

  // Screen positions for RowRuler display (derived, not stored)
  const screenRulerY = contentToScreenY(rulerY);
  const screenRulerHeight = rulerHeight * viewTransform.scale;

  // When RowRuler reports drag (screen coords) → convert to content coords
  const handleRulerPositionChange = useCallback((screenYPct: number) => {
    const { viewTransform: t, containerH: H } = latestRef.current;
    const screenY = (screenYPct / 100) * H;
    const contentY = (screenY - H / 2 - t.y) / t.scale + H / 2;
    setRulerY((contentY / H) * 100);
  }, []);

  const handleRulerHeightChange = useCallback((screenHPct: number) => {
    const { viewTransform: t } = latestRef.current;
    const contentH = screenHPct / t.scale;
    setRulerHeight(Math.max(0.3, contentH));
  }, []);

  const [crochetMarks, setCrochetMarks] = useState<CrochetMark[]>(
    (pattern.progress?.crochet_marks as CrochetMark[]) || []
  );
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);

  const [knittingMarks, setKnittingMarks] = useState<KnittingMark[]>(
    (pattern.progress?.knitting_marks as KnittingMark[]) || []
  );
  const [isPlacingKnittingMarker, setIsPlacingKnittingMarker] = useState(false);

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
    if (row !== prevRow) {
      updateActiveSub((s) => ({ ...s, stitch_count: 0 }));
      setPrevRow(row);
    }
    updateActiveSub((s) => ({ ...s, current_row: row }));
  };

  const handleStitchChange = (count: number) => {
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
    const { rulerY: ry, rulerHeight: rh } = latestRef.current;
    // rulerY and rulerHeight are already in content coords
    const newMark: CompletedMark = { y: ry, height: rh };

    setCompletedMarks((prev) => [...prev, newMark]);
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1, stitch_count: 0 }));

    if (rulerDirection === 'up') {
      setRulerY(ry - rh);
    } else {
      setRulerY(ry + rh);
    }
  }, [rulerDirection, updateActiveSub]);

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
  }, [activeSub, updateActiveSub, screenToContent]);

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
    setCompletedMarks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCompletedMarkDeleteAll = useCallback(() => setCompletedMarks([]), []);

  const handleCrochetMarkMove = useCallback((id: string, screenX: number, screenY: number) => {
    const pos = screenToContent(screenX, screenY);
    setCrochetMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x: pos.x, y: pos.y } : m)));
  }, [screenToContent]);

  const handleCrochetMarkDelete = useCallback((id: string) => {
    setCrochetMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleCrochetMarkDeleteAll = useCallback(() => setCrochetMarks([]), []);

  const handleCancelPlace = useCallback(() => setIsPlacingMarker(false), []);

  const handlePlaceKnittingMarker = useCallback((screenX: number, screenY: number) => {
    const pos = screenToContent(screenX, screenY);
    const newMark: KnittingMark = {
      id: generateId(),
      x: pos.x,
      y: pos.y,
      label: String(knittingMarks.length + 1),
    };
    setKnittingMarks((prev) => [...prev, newMark]);
    setIsPlacingKnittingMarker(false);
  }, [knittingMarks.length, screenToContent]);

  const handleKnittingMarkMove = useCallback((id: string, screenX: number, screenY: number) => {
    const pos = screenToContent(screenX, screenY);
    setKnittingMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x: pos.x, y: pos.y } : m)));
  }, [screenToContent]);

  const handleKnittingMarkDelete = useCallback((id: string) => {
    setKnittingMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleKnittingMarkDeleteAll = useCallback(() => setKnittingMarks([]), []);
  const handleCancelKnittingPlace = useCallback(() => setIsPlacingKnittingMarker(false), []);

  const handleScrollStep = useCallback((direction: 'up' | 'down') => {
    if (isCrochet) return;
    const { rulerHeight: rh } = latestRef.current;
    if (direction === 'up') {
      setRulerY((prev) => prev + rh);
    } else {
      setRulerY((prev) => prev - rh);
    }
  }, [isCrochet]);

  const handleNotePositionChange = useCallback((key: string, pos: NotePosition) => {
    setNotePositions((prev) => ({ ...prev, [key]: pos }));
  }, []);

  const handleAddSubPattern = () => {
    const newSub = createDefaultSubPattern(subPatterns.length + 1);
    setSubPatterns((prev) => [...prev, newSub]);
    setActiveSubId(newSub.id);
  };

  const handleUpdateSubPattern = (id: string, updates: Partial<SubPattern>) => {
    setSubPatterns((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleDeleteSubPattern = (id: string) => {
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
    const contentY = (m.y / 100) * containerH;
    const screenY = (contentY - containerH / 2) * viewTransform.scale + containerH / 2 + viewTransform.y;
    return { y: (screenY / containerH) * 100, height: m.height * viewTransform.scale };
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50/50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-2 sm:px-4 py-2 flex items-center justify-between shrink-0 safe-top">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link to="/dashboard" className="text-gray-400 hover:text-gray-600 shrink-0 p-1 -ml-1 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-medium text-gray-800 truncate text-sm sm:text-base">{pattern.title}</h1>
          <span className="text-[10px] sm:text-xs text-gray-400 shrink-0">
            {isCrochet ? '코바늘' : '대바늘'}
          </span>
          {pattern.yarn && (
            <span className="text-[11px] text-gray-400 shrink-0 hidden sm:block">🧶 {pattern.yarn}</span>
          )}
          {pattern.needle && (
            <span className="text-[11px] text-gray-400 shrink-0 hidden sm:block">🪡 {pattern.needle}</span>
          )}
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 relative min-h-0 p-1 sm:p-2">
        <PatternViewer
          ref={viewerRef}
          fileUrl={pattern.file_url}
          fileType={pattern.file_type}
          rulerYPercent={rulerY}
          rulerHeightPercent={rulerHeight}
          onScrollStep={handleScrollStep}
          onTransformChange={handleTransformChange}
          onResetRuler={!isCrochet ? () => {
            const { viewTransform: t, containerH: H, rulerHeight: rh } = latestRef.current;
            const contentY = (H / 2 - H / 2 - t.y) / t.scale + H / 2;
            setRulerY((contentY / H) * 100 - rh / 2);
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
            />
          )}
          {!isCrochet && (
            <CompletedOverlay
              marks={screenCompletedMarks}
              onUpdate={handleCompletedMarkUpdate}
              onDelete={handleCompletedMarkDelete}
              onDeleteAll={handleCompletedMarkDeleteAll}
              onSelectionChange={setHasMarkSelection}
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
              onToggleDirection={() => setRulerDirection((d) => (d === 'up' ? 'down' : 'up'))}
              onToggleSettings={() => setShowRulerSettings((v) => !v)}
            />
          )}
        </PatternViewer>

        {/* Ruler settings floating panel — opposite side of direction */}
        {showRulerSettings && !isCrochet && (
          <div
            className="absolute z-30 bg-white/96 backdrop-blur-sm rounded-2xl shadow-lg border border-rose-100 px-3 py-2.5"
            style={
              rulerDirection === 'up'
                ? { top: `calc(${screenRulerY + screenRulerHeight}% + 8px)`, left: 'clamp(108px, 30vw, 148px)', right: '60px' }
                : { top: `calc(${screenRulerY}% - 8px)`, left: 'clamp(108px, 30vw, 148px)', right: '60px', transform: 'translateY(-100%)' }
            }
          >
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-semibold text-rose-500 whitespace-nowrap">높이</span>
              <input
                type="range"
                min={0.3}
                max={10}
                step={0.05}
                value={rulerHeight}
                onChange={(e) => {
                  setIsAdjustingRuler(true);
                  setRulerHeight(Number(e.target.value));
                }}
                onPointerUp={() => setIsAdjustingRuler(false)}
                onMouseUp={() => setIsAdjustingRuler(false)}
                onTouchEnd={() => setIsAdjustingRuler(false)}
                className="flex-1 min-w-0 h-1.5 accent-rose-400 cursor-pointer"
              />
              <span className="text-[11px] text-rose-500 font-mono w-8 text-right shrink-0">
                {rulerHeight.toFixed(2)}
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
      <div className="bg-white border-t border-gray-100 px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 shrink-0 safe-bottom">
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
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <div className="text-center min-w-[45px] sm:min-w-[50px]">
                <div className="text-lg sm:text-xl font-bold text-gray-800">{activeSub?.current_row || 0}</div>
                <div className="text-[10px] text-gray-400">/ {activeSub?.total_rows || 1}단</div>
              </div>
              <button
                onClick={() => handleRowChange((activeSub?.current_row || 0) + 1)}
                className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-rose-400 text-white text-sm font-bold flex items-center justify-center hover:bg-rose-500 active:bg-rose-600 transition-colors"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsPlacingMarker(true)}
                disabled={isPlacingMarker}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 min-h-[44px] text-xs font-semibold bg-rose-500 text-white rounded-xl hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
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
                  className="flex items-center justify-center w-10 h-10 min-h-[44px] rounded-xl bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-400 active:bg-red-100 transition-colors"
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
                className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-xs font-semibold bg-violet-500 text-white rounded-xl hover:bg-violet-600 active:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                title="마커 배치"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                마커{knittingMarks.length > 0 && ` (${knittingMarks.length})`}
              </button>
              {knittingMarks.length > 0 && (
                <button
                  onClick={() => { if (confirm('모든 마커를 삭제하시겠습니까?')) handleKnittingMarkDeleteAll(); }}
                  className="flex items-center justify-center w-10 h-10 min-h-[44px] rounded-xl bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-400 active:bg-red-100 transition-colors"
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
