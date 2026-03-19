'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress, CompletedMark, RulerDirection, NotePosition, SubPattern, CrochetMark } from '@/lib/types';
import PatternViewer, { type PatternViewerHandle } from '@/components/PatternViewer';
import RowRuler from '@/components/RowRuler';
import CompletedOverlay from '@/components/CompletedOverlay';
import CrochetMarkers from '@/components/CrochetMarkers';
import NoteBubbles from '@/components/NoteBubbles';
import SubPatternSelector from '@/components/SubPatternSelector';
import RowCounter from '@/components/RowCounter';
import StitchCounter from '@/components/StitchCounter';
import PatternNotes from '@/components/PatternNotes';
import SaveIndicator from '@/components/SaveIndicator';
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

interface Props {
  pattern: PatternWithProgress;
}

export default function PatternViewerClient({ pattern }: Props) {
  const supabase = createClient();
  const viewerRef = useRef<PatternViewerHandle>(null);
  const { isActive: wakeLockActive, request: requestWakeLock, release: releaseWakeLock } = useWakeLock();

  const isCrochet = pattern.type === 'crochet';

  // Initialize sub-patterns
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

  // Knitting states
  const [rulerY, setRulerY] = useState(pattern.progress?.ruler_position_y || 50);
  const [rulerHeight, setRulerHeight] = useState(pattern.progress?.ruler_height || 5);
  const [rulerDirection, setRulerDirection] = useState<RulerDirection>(
    (pattern.progress?.ruler_direction as RulerDirection) || 'up'
  );
  const [completedMarks, setCompletedMarks] = useState<CompletedMark[]>(
    (pattern.progress?.completed_marks as CompletedMark[]) || []
  );
  const [hasMarkSelection, setHasMarkSelection] = useState(false);

  // Crochet states
  const [crochetMarks, setCrochetMarks] = useState<CrochetMark[]>(
    (pattern.progress?.crochet_marks as CrochetMark[]) || []
  );
  const [isPlacingMarker, setIsPlacingMarker] = useState(false);

  // Shared states
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

  const saveFn = useCallback(
    async (data: Record<string, unknown>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('pattern_progress')
        .upsert(
          {
            pattern_id: pattern.id,
            user_id: user.id,
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
      notes,
      note_positions: notePositions,
      sub_patterns: subPatterns,
      active_sub_pattern_id: activeSubId,
    });
  }, [activeSub, rulerY, rulerHeight, rulerDirection, completedMarks, crochetMarks, notes, notePositions, subPatterns, activeSubId, save]);

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

  // Knitting: complete via ruler
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

  // Crochet: place marker
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

  // Sub-pattern management
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
    return () => { releaseWakeLock(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-50/50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="font-medium text-gray-800 truncate">{pattern.title}</h1>
          <span className="text-xs text-gray-400 shrink-0">
            {isCrochet ? '코바늘' : '대바늘'}
          </span>
          {pattern.yarn && (
            <span className="text-[11px] text-gray-400 shrink-0 hidden sm:block">🧶 {pattern.yarn}</span>
          )}
          {pattern.needle && (
            <span className="text-[11px] text-gray-400 shrink-0 hidden sm:block">🪡 {pattern.needle}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={status} />
          <button
            onClick={() => (wakeLockActive ? releaseWakeLock() : requestWakeLock())}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
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
      <div className="flex-1 relative min-h-0 p-2">
        <PatternViewer
          ref={viewerRef}
          fileUrl={pattern.file_url}
          fileType={pattern.file_type}
          rulerHeightPercent={rulerHeight}
          onScrollStep={isCrochet ? undefined : (direction) => {
            if (direction === 'up') {
              setRulerY((prev) => Math.min(100 - rulerHeight, prev + rulerHeight));
            } else {
              setRulerY((prev) => Math.max(0, prev - rulerHeight));
            }
          }}
          contentOverlay={
            <>
              {/* Knitting: completed marks */}
              {!isCrochet && (
                <CompletedOverlay
                  marks={completedMarks}
                  onUpdate={(index, mark) => {
                    setCompletedMarks((prev) => prev.map((m, i) => (i === index ? mark : m)));
                  }}
                  onDelete={(index) => {
                    setCompletedMarks((prev) => prev.filter((_, i) => i !== index));
                  }}
                  onDeleteAll={() => setCompletedMarks([])}
                  onSelectionChange={setHasMarkSelection}
                />
              )}

              {/* Crochet: markers */}
              {isCrochet && (
                <CrochetMarkers
                  marks={crochetMarks}
                  isPlacing={isPlacingMarker}
                  onPlace={handlePlaceMarker}
                  onMove={(id, x, y) => {
                    setCrochetMarks((prev) => prev.map((m) => (m.id === id ? { ...m, x, y } : m)));
                  }}
                  onDelete={(id) => {
                    setCrochetMarks((prev) => prev.filter((m) => m.id !== id));
                  }}
                  onDeleteAll={() => setCrochetMarks([])}
                  onCancelPlace={() => setIsPlacingMarker(false)}
                />
              )}

              {/* Shared: note bubbles */}
              <NoteBubbles
                notes={notes}
                positions={notePositions}
                onPositionChange={(key, pos) => {
                  setNotePositions((prev) => ({ ...prev, [key]: pos }));
                }}
              />
            </>
          }
        >
          {/* Knitting: ruler (fixed overlay) */}
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

        {/* Knitting: fixed delete-all button */}
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
      <div className="bg-white border-t border-gray-100 px-4 py-3 space-y-3 shrink-0 safe-bottom">
        {/* Sub-pattern selector + progress */}
        <div className="flex items-center gap-3">
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
          /* Crochet controls */
          <div className="flex items-center justify-between gap-3">
            {/* Completed count */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRowChange(Math.max(0, (activeSub?.current_row || 0) - 1))}
                disabled={(activeSub?.current_row || 0) <= 0}
                className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 text-sm font-bold flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <div className="text-center min-w-[50px]">
                <div className="text-xl font-bold text-gray-800">{activeSub?.current_row || 0}</div>
                <div className="text-[10px] text-gray-400">/ {activeSub?.total_rows || 1}단</div>
              </div>
              <button
                onClick={() => handleRowChange((activeSub?.current_row || 0) + 1)}
                className="w-9 h-9 rounded-lg bg-rose-400 text-white text-sm font-bold flex items-center justify-center hover:bg-rose-500 active:bg-rose-600 transition-colors"
              >
                +
              </button>
            </div>

            {/* Marker button */}
            <button
              onClick={() => setIsPlacingMarker(true)}
              disabled={isPlacingMarker}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold bg-rose-500 text-white rounded-xl hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              마커 ({crochetMarks.length})
            </button>
          </div>
        ) : (
          /* Knitting controls */
          <div className="flex items-center justify-between gap-4">
            <RowCounter
              current={activeSub?.current_row || 0}
              total={activeSub?.total_rows || 1}
              onChange={handleRowChange}
            />
            <StitchCounter count={activeSub?.stitch_count || 0} onChange={handleStitchChange} />
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
