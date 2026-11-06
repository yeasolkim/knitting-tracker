import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TextSize } from '@/lib/prefs';

interface HelpSheetProps {
  open: boolean;
  onClose: () => void;
  isCrochetRound: boolean;
  followRuler: boolean;
  onToggleFollowRuler: () => void;
  viewLocked: boolean;
  onToggleViewLock: () => void;
  showStitchCounter: boolean;
  onToggleStitchCounter: () => void;
  textSize: TextSize;
  onTextSize: (s: TextSize) => void;
  session: { rows: number; seconds: number };
  onReplayGuide: () => void;
}

function Row({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-3 min-h-[44px] text-sm text-[#3d2b1f] cursor-pointer select-none">
      <span>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative w-11 h-6 rounded-full border-2 transition-colors ${checked ? 'bg-[#b5541e] border-[#9a4318]' : 'bg-[#e8d8c0] border-[#b07840]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#fdf6e8] shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

export default function HelpSheet(p: HelpSheetProps) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.open, p.onClose, p]);
  if (!p.open) return null;
  const minutes = Math.round(p.session.seconds / 60);
  const gestures = [
    t('help.g.rulerDrag'), t('help.g.bandTap'), t('help.g.chipLongPress'),
    t('help.g.counterLongPress'), t('help.g.markerLongPress'),
    ...(p.isCrochetRound ? [t('help.g.halfRound')] : []),
  ];
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t('help.title')}>
      <div className="absolute inset-0 bg-[#3d2b1f]/40" onClick={p.onClose} />
      <div className="relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto bg-[#fdf6e8] rounded-t-2xl sm:rounded-2xl border-2 border-[#b07840] shadow-xl px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]" style={{ touchAction: 'pan-y' }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#3d2b1f]">{t('help.title')}</h2>
          <button onClick={p.onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-[#7a5c46] hover:bg-[#ede5cc]" aria-label={t('common.close')}>×</button>
        </div>

        <div className="text-[11px] font-bold tracking-widest uppercase text-[#a08060] mt-2">{t('help.session')}</div>
        <div className="text-sm text-[#3d2b1f] font-semibold">{t('help.sessionRows', { rows: p.session.rows, minutes })}</div>

        <div className="text-[11px] font-bold tracking-widest uppercase text-[#a08060] mt-4 mb-1">{t('help.options')}</div>
        <Row label={t('view.followRuler')} checked={p.followRuler} onChange={p.onToggleFollowRuler} />
        <Row label={t('view.viewLock')} checked={p.viewLocked} onChange={p.onToggleViewLock} />
        <Row label={t('counter.stitchToggle')} checked={p.showStitchCounter} onChange={p.onToggleStitchCounter} />
        <div className="flex items-center justify-between gap-3 min-h-[44px] text-sm text-[#3d2b1f]">
          <span>{t('help.textSize')}</span>
          <div className="flex rounded-lg border-2 border-[#b07840] overflow-hidden">
            {(['small', 'normal', 'large'] as TextSize[]).map((s) => (
              <button
                key={s}
                onClick={() => p.onTextSize(s)}
                className={`px-3 h-9 text-xs font-bold ${p.textSize === s ? 'bg-[#b5541e] text-[#fdf6e8]' : 'bg-[#fdf6e8] text-[#7a5c46] hover:bg-[#f5edd6]'}`}
              >{t(`help.textSize.${s}` as 'help.textSize.small')}</button>
            ))}
          </div>
        </div>

        <div className="text-[11px] font-bold tracking-widest uppercase text-[#a08060] mt-4 mb-1">{t('help.gestures')}</div>
        <ul className="text-sm text-[#3d2b1f] space-y-1.5 list-disc pl-5">
          {gestures.map((g) => <li key={g}>{g}</li>)}
          <li className="text-[#7a5c46]">{t('help.keys')}</li>
        </ul>

        <div className="mt-4">
          <button onClick={p.onReplayGuide} className="w-full h-11 rounded-lg border-2 border-[#b07840] bg-[#f5edd6] text-sm font-bold text-[#7a5c46] hover:bg-[#ede5cc]">{t('help.replayGuide')}</button>
        </div>
      </div>
    </div>
  );
}
