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
  const supabase = createClient();
  const viewerRef = useRef<PatternViewerHandle>(null);
  const { isActive: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

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

  const [rulerY, setRulerY] = useState(pattern.progress?.ruler_position_y || 50);
  const [rulerHeight, setRulerHeight] = useState(pattern.progress?.ruler_height || 5);
  const [rulerDirection, setRulerDirection] = useState<RulerDirection>(
    (pattern.progress?.ruler_direction as RulerDirection) || 'up'
  );
  const [completedMarks, setCompletedMarks] = useState<CompletedMark[]>(
    (pattern.progress?.completed_marks as CompletedMark[]) || []
  );
  const [hasMarkSelection, setHasMarkSelection] = useState(false);

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
      const viewer = viewerRef.current;
      if (!viewer) return;

      setNotePositions((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(updatedNotes)) {
          if (!next[key]) {
            const contentCoords = viewer.screenToContent(rulerY, rulerHeight);
            next[key] = { x: 90, y: contentCoords.y + contentCoords.height / 2 };
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
    [rulerY, rulerHeight]
  );

  const handleComplete = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const contentCoords = viewer.screenToContent(rulerY, rulerHeight);
    const newMark: CompletedMark = {
      y: contentCoords.y,
      height: contentCoords.height,
    };

    setCompletedMarks((prev) => [...prev, newMark]);
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1, stitch_count: 0 }));

    if (rulerDirection === 'up') {
      setRulerY((prev) => Math.max(0, prev - rulerHeight));
    } else {
      setRulerY((prev) => Math.min(100 - rulerHeight, prev + rulerHeight));
    }
  }, [rulerY, rulerHeight, rulerDirection, updateActiveSub]);

  const handlePlaceMarker = useCallback((x: number, y: number) => {
    const nextRow = (activeSub?.current_row || 0) + 1;
    const newMark: CrochetMark = {
      id: generateId(),
      x,
      y,
      label: String(nextRow),
    };
    setCrochetMarks((prev) => [...prev, newMark]);
    updateActiveSub((s) => ({ ...s, current_row: s.current_row + 1, stitch_count: 0 }));
    setIsPlacingMarker(false);
  }, [activeSub, updateActiveSub]);

  const handleCompletedMarkUpdate = useCallback((index: number, mark: CompletedMark) => {
    setCompletedMarks((prev) => prev.map((m, i) => (i === index ? mark : m)));
  }, []);

  const handleCompletedMarkDelete = useCallback((index: number) => {
    setCompletedMarks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCompletedMarkDeleteAll = useCallback(() => setCompletedMarks([]), []);

  const handleCrochetMarkMove = useCallback((id: string, x: number, y: number) => {
    setCrochetMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
  }, []);

  const handleCrochetMarkDelete = useCallback((id: string) => {
    setCrochetMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleCrochetMarkDeleteAll = useCallback(() => setCrochetMarks([]), []);

  const handleCancelPlace = useCallback(() => setIsPlacingMarker(false), []);

  const handlePlaceKnittingMarker = useCallback((y: number) => {
    const newMark: KnittingMark = {
      id: generateId(),
      y,
      label: String(knittingMarks.length + 1),
    };
    setKnittingMarks((prev) => [...prev, newMark]);
    setIsPlacingKnittingMarker(false);
  }, [knittingMarks.length]);

  const handleKnittingMarkMove = useCallback((id: string, y: number) => {
    setKnittingMarks((prev) => prev.map((m) => (m.id === id ? { ...m, y } : m)));
  }, []);

  const handleKnittingMarkDelete = useCallback((id: string) => {
    setKnittingMarks((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleKnittingMarkDeleteAll = useCallback(() => setKnittingMarks([]), []);
  const handleCancelKnittingPlace = useCallback(() => setIsPlacingKnittingMarker(false), []);

  const handleScrollStep = useCallback((direction: 'up' | 'down') => {
    if (isCrochet) return;
    if (direction === 'up') {
      setRulerY((prev) => Math.min(100 - rulerHeight, prev + rulerHeight));
    } else {
      setRulerY((prev) => Math.max(0, prev - rulerHeight));
    }
  }, [isCrochet, rulerHeight]);

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
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => (wakeLockActive ? releaseWakeLock() : requestWakeLock())}
            className={`text-xs px-2 py-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-colors ${
              wakeLockActive
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-gray-100 text-gray-400'
            }`}
            title={wakeLockActive ? '화면 켜짐 유지 중' : '화면 꺼짐 방지'}
          >
            {wakeLockActive ? '☀️' : '🌙'}
          </button>
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
          contentOverlay={
            <>
              {!isCrochet && (
                <CompletedOverlay
                  marks={completedMarks}
                  onUpdate={handleCompletedMarkUpdate}
                  onDelete={handleCompletedMarkDelete}
                  onDeleteAll={handleCompletedMarkDeleteAll}
                  onSelectionChange={setHasMarkSelection}
                />
              )}

              {!isCrochet && (
                <KnittingMarkers
                  marks={knittingMarks}
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
                  marks={crochetMarks}
                  isPlacing={isPlacingMarker}
                  onPlace={handlePlaceMarker}
                  onMove={handleCrochetMarkMove}
                  onDelete={handleCrochetMarkDelete}
                  onDeleteAll={handleCrochetMarkDeleteAll}
                  onCancelPlace={handleCancelPlace}
                />
              )}

              <NoteBubbles
                notes={notes}
                positions={notePositions}
                onPositionChange={handleNotePositionChange}
              />
            </>
          }
        >
          {!isCrochet && (
            <RowRuler
              positionY={rulerY}
              height={rulerHeight}
              direction={rulerDirection}
              onChangePosition={setRulerY}
              onChangeHeight={setRulerHeight}
              onComplete={handleComplete}
              onToggleDirection={() => setRulerDirection((d) => (d === 'up' ? 'down' : 'up'))}
            />
          )}
        </PatternViewer>

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
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <RowCounter
              current={activeSub?.current_row || 0}
              total={activeSub?.total_rows || 1}
              onChange={handleRowChange}
            />
            <div className="flex items-center gap-2">
              <StitchCounter count={activeSub?.stitch_count || 0} onChange={handleStitchChange} />
              <button
                onClick={() => setIsPlacingKnittingMarker(true)}
                disabled={isPlacingKnittingMarker}
                className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-semibold bg-violet-500 text-white rounded-xl hover:bg-violet-600 active:bg-violet-700 disabled:opacity-50 transition-colors shadow-sm"
                title="마커 배치"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="hidden sm:inline">마커</span>
                {knittingMarks.length > 0 && (
                  <span className="text-white/80">({knittingMarks.length})</span>
                )}
              </button>
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
