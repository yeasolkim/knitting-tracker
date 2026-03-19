interface SaveIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
}

export default function SaveIndicator({ status }: SaveIndicatorProps) {
  if (status === 'idle') return null;

  const config = {
    saving: { text: '저장 중...', color: 'text-amber-500', bg: 'bg-amber-50' },
    saved: { text: '저장됨', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    error: { text: '저장 실패', color: 'text-red-500', bg: 'bg-red-50' },
  };

  const { text, color, bg } = config[status];

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${color} ${bg}`}>
      {status === 'saving' && (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {text}
    </span>
  );
}
