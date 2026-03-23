import { useEffect, useMemo, useRef, useState } from 'react';
import type { SubPattern } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface PatternNotesProps {
  currentRow: number;
  activeSubPattern: SubPattern;
  subPatterns: SubPattern[];
  notes: Record<string, string>;       // key: "subId:row"
  onUpdate: (notes: Record<string, string>) => void;
  onDelete: (key: string) => void;
}

function noteKey(subId: string, row: number) {
  return `${subId}:${row}`;
}

function parseNoteKey(key: string): { subId: string; row: number } | null {
  const i = key.indexOf(':');
  if (i === -1) return null;
  return { subId: key.slice(0, i), row: Number(key.slice(i + 1)) };
}

export default function PatternNotes({
  currentRow,
  activeSubPattern,
  subPatterns,
  notes,
  onUpdate,
  onDelete,
}: PatternNotesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const currentKey = noteKey(activeSubPattern.id, currentRow);
  const [draftNote, setDraftNote] = useState(notes[currentKey] || '');

  // Sync draft when switching rows or when external notes change (e.g. clear all)
  useEffect(() => {
    setDraftNote(notes[currentKey] || '');
  }, [currentKey, notes]);

  const savedNote = notes[currentKey] || '';
  const hasUnsaved = draftNote !== savedNote;

  const handleSaveCurrentNote = () => {
    const updated = { ...notes };
    if (draftNote.trim()) {
      updated[currentKey] = draftNote;
    } else {
      delete updated[currentKey];
    }
    onUpdate(updated);
  };

  const { groupedNotes, entriesBySub, totalCount } = useMemo(() => {
    const entriesBySub = new Map<string, { key: string; row: number; text: string }[]>();
    for (const [key, text] of Object.entries(notes)) {
      const parsed = parseNoteKey(key);
      if (!parsed) continue;
      const arr = entriesBySub.get(parsed.subId) || [];
      arr.push({ key, row: parsed.row, text });
      entriesBySub.set(parsed.subId, arr);
    }
    const groupedNotes: { sub: SubPattern; entries: { key: string; row: number; text: string }[] }[] = [];
    for (const sub of subPatterns) {
      const entries = entriesBySub.get(sub.id);
      if (entries && entries.length > 0) {
        entries.sort((a, b) => a.row - b.row);
        groupedNotes.push({ sub, entries });
      }
    }
    return { groupedNotes, entriesBySub, totalCount: Object.keys(notes).length };
  }, [notes, subPatterns]);

  const handleSaveEditingNote = (key: string) => {
    const updated = { ...notes };
    if (editingDraft.trim()) {
      updated[key] = editingDraft;
    } else {
      delete updated[key];
    }
    onUpdate(updated);
    setEditingKey(null);
  };

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      const el = scrollRef.current.querySelector(`[data-key="${currentKey}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isOpen, currentKey]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#7a5c46] hover:text-[#3d2b1f] tracking-wide transition-colors min-h-[44px]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {t('notes.title')}{totalCount > 0 && <span className="text-[#b5541e]"> ({totalCount})</span>}
          {hasUnsaved && <span className="text-[9px] text-amber-500 font-bold tracking-widest">{t('notes.unsaved')}</span>}
          <svg
            className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && totalCount > 0 && (
          <div className="flex items-center gap-2">
            {(entriesBySub.get(activeSubPattern.id)?.length || 0) > 0 && (
              <button
                onClick={() => {
                  if (confirm(t('notes.clearCurrentConfirm').replace('{name}', activeSubPattern.name))) {
                    const updated = { ...notes };
                    for (const key of Object.keys(updated)) {
                      if (key.startsWith(activeSubPattern.id + ':')) delete updated[key];
                    }
                    onUpdate(updated);
                  }
                }}
                className="text-[10px] text-[#b5541e] hover:text-[#9a4318] tracking-wide transition-colors"
              >
                {t('notes.clearCurrent')}
              </button>
            )}
            {totalCount > 0 && subPatterns.length > 1 && (
              <button
                onClick={() => {
                  if (confirm(t('notes.clearAllConfirm'))) onUpdate({});
                }}
                className="text-[10px] text-[#b5541e] hover:text-[#9a4318] tracking-wide transition-colors"
              >
                {t('notes.clearAll')}
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="mt-1.5 space-y-2">
          {/* Current row input */}
          <div className="bg-[#f5edd6] border-2 border-[#d4b896] rounded-lg p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#b5541e] bg-[#fdf6e8] border border-[#d4b896] px-1.5 py-0.5 rounded">
                {activeSubPattern.name}
              </span>
              <span className="text-[10px] text-[#a08060]">{currentRow}단</span>
            </div>
            <textarea
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder={t('notes.currentPlaceholder')}
              className="w-full h-16 text-sm border-2 border-[#d4b896] rounded-lg p-2 resize-none focus:outline-none focus:border-[#b5541e] bg-[#fdf6e8] text-[#3d2b1f] placeholder:text-[#c4a882]"
            />
            <div className="flex justify-end mt-1.5">
              <button
                onClick={handleSaveCurrentNote}
                disabled={!hasUnsaved && !draftNote.trim()}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${
                  hasUnsaved
                    ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318] hover:bg-[#9a4318] shadow-[2px_2px_0_#9a4318] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]'
                    : 'bg-[#fdf6e8] text-[#a08060] border-[#d4b896] opacity-60'
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t('notes.save')}
              </button>
            </div>
          </div>

          {/* Grouped notes list */}
          {groupedNotes.length > 0 && (
            <div ref={scrollRef} className="max-h-28 sm:max-h-48 overflow-y-auto border-t-2 border-[#d4b896] pt-2 space-y-3">
              {groupedNotes.map(({ sub, entries }) => (
                <div key={sub.id}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span
                      className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded border ${
                        sub.id === activeSubPattern.id
                          ? 'text-[#b5541e] bg-[#fdf6e8] border-[#b5541e]'
                          : 'text-[#7a5c46] bg-[#f5edd6] border-[#d4b896]'
                      }`}
                    >
                      {sub.name}
                    </span>
                    <span className="text-[10px] text-[#a08060]">{t('notes.count', { n: entries.length })}</span>
                  </div>

                  <div className="space-y-0.5">
                    {entries.map(({ key, row, text }) => {
                      const isCurrent = key === currentKey;
                      const isEditing = editingKey === key;
                      return (
                        <div
                          key={key}
                          data-key={key}
                          className={`flex gap-2 items-start group rounded-lg px-2 py-1.5 transition-colors ${
                            isCurrent ? 'bg-[#f5edd6]' : 'hover:bg-[#f5edd6]'
                          }`}
                        >
                          <span
                            className={`text-xs font-semibold mt-0.5 shrink-0 w-8 text-right ${
                              isCurrent ? 'text-[#b5541e]' : 'text-[#a08060]'
                            }`}
                          >
                            {t('notes.rowLabel', { n: row })}
                          </span>

                          {isEditing ? (
                            <div className="flex-1 flex flex-col gap-1">
                              <textarea
                                autoFocus
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                className="w-full h-14 text-sm border-2 border-[#d4b896] rounded-lg p-1.5 resize-none focus:outline-none focus:border-[#b5541e] bg-[#fdf6e8] text-[#3d2b1f]"
                              />
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={() => setEditingKey(null)}
                                  className="text-[10px] text-[#a08060] px-2 py-1"
                                >
                                  취소
                                </button>
                                <button
                                  onClick={() => handleSaveEditingNote(key)}
                                  className="text-[10px] font-bold text-[#b5541e] bg-[#fdf6e8] border border-[#b5541e] rounded px-2 py-1"
                                >
                                  {t('notes.save')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className="flex-1 text-sm text-[#3d2b1f] cursor-pointer whitespace-pre-wrap break-words"
                              onClick={() => { setEditingKey(key); setEditingDraft(text); }}
                            >
                              {text}
                            </p>
                          )}

                          {!isEditing && (
                            <button
                              onClick={() => onDelete(key)}
                              className="text-[#d4b896] hover:text-[#b5541e] sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0 p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-1.5"
                              aria-label="메모 삭제"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
