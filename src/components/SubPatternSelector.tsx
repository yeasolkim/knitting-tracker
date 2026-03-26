import { useState, useRef } from 'react';
import type { SubPattern } from '@/lib/types';
import { useLanguage } from '@/contexts/LanguageContext';

interface SubPatternSelectorProps {
  subPatterns: SubPattern[];
  activeId: string;
  isCrochet?: boolean;
  initialExpanded?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<SubPattern>) => void;
  onDelete: (id: string) => void;
}

function TotalRowsInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const display = draft !== null ? draft : String(value);

  return (
    <input
      ref={inputRef}
      type="number"
      min={1}
      value={display}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = parseInt(draft ?? '');
        onChange(isNaN(parsed) || parsed < 1 ? 1 : parsed);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') inputRef.current?.blur();
      }}
      className="w-16 text-xs border-2 border-[#b07840] rounded-lg px-1.5 py-0.5 text-[#3d2b1f] bg-[#fdf6e8] focus:outline-none focus:border-[#b5541e] text-center"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export default function SubPatternSelector({
  subPatterns,
  activeId,
  isCrochet = false,
  initialExpanded = false,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: SubPatternSelectorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const { t } = useLanguage();

  const active = subPatterns.find((s) => s.id === activeId);

  const startRename = (sub: SubPattern) => {
    setEditingId(sub.id);
    setEditName(sub.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onUpdate(editingId, { name: editName.trim() });
    }
    setEditingId(null);
  };

  if (subPatterns.length === 0) return null;

  return (
    <div className="relative">
      {/* Active sub-pattern tab */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#3d2b1f] tracking-wide bg-[#f5edd6] border-2 border-[#b07840] hover:border-[#b5541e] px-3 py-1.5 min-h-[44px] rounded-lg transition-colors"
      >
        <span className="truncate max-w-[100px] sm:max-w-[120px]">{active?.name || `${t('sub.defaultPrefix')} 1`}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isExpanded && (
        <div className="absolute bottom-full left-0 right-0 sm:right-auto mb-1.5 bg-[#fdf6e8] rounded-xl border-2 border-[#b07840] shadow-[3px_3px_0_#b07840] py-1 min-w-[220px] sm:min-w-[240px] max-w-[calc(100vw-24px)] max-h-[60vh] overflow-y-auto z-50">
          {subPatterns.map((sub) => (
            <div
              key={sub.id}
              className={`px-3 py-2.5 sm:py-2 hover:bg-[#f5edd6] ${sub.id === activeId ? 'bg-[#f5edd6]' : ''}`}
            >
              {editingId === sub.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="flex-1 text-sm border-2 border-[#b07840] rounded-lg px-2 py-0.5 text-[#3d2b1f] bg-[#fdf6e8] focus:outline-none focus:border-[#b5541e]"
                  />
                  <button
                    onMouseDown={(e) => { e.preventDefault(); commitRename(); }}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-[#b5541e] text-[#fdf6e8] hover:bg-[#9a4318] active:scale-95 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    className="flex-1 text-left text-sm text-[#3d2b1f] truncate"
                    onClick={() => {
                      onSelect(sub.id);
                      setIsExpanded(false);
                    }}
                  >
                    <span className="font-semibold">{sub.name}</span>
                    <span className="text-[#a08060] ml-1.5 text-xs">
                      {t('sub.rowDisplay', { current: sub.current_row, total: sub.total_rows })}
                    </span>
                  </button>

                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(sub);
                      }}
                      className="text-[#b07840] hover:text-[#7a5c46] p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title={t('sub.rename')}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {subPatterns.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t('sub.deleteConfirm').replace('{name}', sub.name))) {
                            onDelete(sub.id);
                          }
                        }}
                        className="text-[#b07840] hover:text-[#b5541e] p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Total setting */}
              {sub.id === activeId && editingId !== sub.id && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-[#a08060] tracking-wide">{t('sub.totalRows')}</span>
                  <TotalRowsInput
                    value={sub.total_rows}
                    onChange={(val) => onUpdate(sub.id, { total_rows: val })}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Add button */}
          <div className="border-t-2 border-[#b07840] mt-1 pt-1 px-3 py-1">
            <button
              onClick={() => {
                onAdd();
                setIsExpanded(false);
              }}
              className="text-sm text-[#b5541e] hover:text-[#9a4318] font-semibold flex items-center gap-1 min-h-[44px] w-full tracking-wide"
            >
              <span>+</span> {isCrochet ? t('sub.addPatternCrochet') : t('sub.addPattern')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
