import { useState } from 'react';
import type { SubPattern } from '@/lib/types';

interface SubPatternSelectorProps {
  subPatterns: SubPattern[];
  activeId: string;
  isCrochet?: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<SubPattern>) => void;
  onDelete: (id: string) => void;
}

export default function SubPatternSelector({
  subPatterns,
  activeId,
  isCrochet = false,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
}: SubPatternSelectorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

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
        className="flex items-center gap-1.5 text-xs font-semibold text-[#3d2b1f] tracking-wide bg-[#f5edd6] border-2 border-[#d4b896] hover:border-[#b5541e] px-3 py-1.5 min-h-[44px] rounded-lg transition-colors"
      >
        <span className="truncate max-w-[100px] sm:max-w-[120px]">{active?.name || '도안 1'}</span>
        <svg
          className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isExpanded && (
        <div className="absolute bottom-full left-0 right-0 sm:right-auto mb-1.5 bg-[#fdf6e8] rounded-xl border-2 border-[#d4b896] shadow-[3px_3px_0_#d4b896] py-1 min-w-[220px] sm:min-w-[240px] max-w-[calc(100vw-24px)] max-h-[60vh] overflow-y-auto z-50">
          {subPatterns.map((sub) => (
            <div
              key={sub.id}
              className={`px-3 py-2.5 sm:py-2 hover:bg-[#f5edd6] ${sub.id === activeId ? 'bg-[#f5edd6]' : ''}`}
            >
              {editingId === sub.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-full text-sm border-2 border-[#d4b896] rounded-lg px-2 py-0.5 text-[#3d2b1f] bg-[#fdf6e8] focus:outline-none focus:border-[#b5541e]"
                />
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
                      {sub.current_row}/{sub.total_rows}단
                    </span>
                  </button>

                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(sub);
                      }}
                      className="text-[#d4b896] hover:text-[#7a5c46] p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="이름 변경"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {subPatterns.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`"${sub.name}"을(를) 삭제하시겠습니까?`)) {
                            onDelete(sub.id);
                          }
                        }}
                        className="text-[#d4b896] hover:text-[#b5541e] p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                  <span className="text-[10px] text-[#a08060] tracking-wide">총 단수</span>
                  <input
                    type="number"
                    value={sub.total_rows}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      onUpdate(sub.id, { total_rows: val });
                    }}
                    min={1}
                    className="w-16 text-xs border-2 border-[#d4b896] rounded-lg px-1.5 py-0.5 text-[#3d2b1f] bg-[#fdf6e8] focus:outline-none focus:border-[#b5541e] text-center"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          ))}

          {/* Add button */}
          <div className="border-t-2 border-[#d4b896] mt-1 pt-1 px-3 py-1">
            <button
              onClick={() => {
                onAdd();
                setIsExpanded(false);
              }}
              className="text-sm text-[#b5541e] hover:text-[#9a4318] font-semibold flex items-center gap-1 min-h-[44px] w-full tracking-wide"
            >
              <span>+</span> {isCrochet ? '도안/모티브 추가' : '도안 추가'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
