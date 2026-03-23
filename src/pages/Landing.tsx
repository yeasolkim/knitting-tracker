import { Link } from 'react-router-dom';
import { useLanguage, LanguageToggle } from '@/contexts/LanguageContext';

function KottaIcon({ size = 24, color = '#b5541e', opacity2 = 0.45 }: { size?: number; color?: string; opacity2?: number }) {
  const w = size;
  const h = size * 0.78;
  const mid = h / 2;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path
        d={`M0,${mid} L${w * 0.25},0 L${w * 0.5},${mid} L${w * 0.75},0 L${w},${mid}`}
        stroke={color} strokeWidth={size * 0.115} strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d={`M0,${h} L${w * 0.25},${mid} L${w * 0.5},${h} L${w * 0.75},${mid} L${w},${h}`}
        stroke={color} strokeOpacity={opacity2} strokeWidth={size * 0.115} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function StitchDivider() {
  return (
    <div className="flex items-center gap-1.5 justify-center my-8">
      {Array.from({ length: 7 }).map((_, i) => (
        <svg key={i} width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M0,4 L2.5,0 L5,4 L7.5,0 L10,4" stroke="#b5541e" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      ))}
    </div>
  );
}

const STITCH_PATH = "M0,6 L8,0 L16,6 L24,0 L32,6 L40,0 L48,6 L56,0 L64,6 L72,0 L80,6 L88,0 L96,6 L104,0 L112,6 L120,0 L128,6 L136,0 L144,6 L152,0 L160,6 L168,0 L176,6 L184,0 L190,6";
const STITCH_PATH2 = "M0,12 L8,6 L16,12 L24,6 L32,12 L40,6 L48,12 L56,6 L64,12 L72,6 L80,12 L88,6 L96,12 L104,6 L112,12 L120,6 L128,12 L136,6 L144,12 L152,6 L160,12 L168,6 L176,12 L184,6 L190,12";

function AppMockup() {
  const { t } = useLanguage();
  const currentRow = 7;
  const totalRows = 40;
  const visibleRows = Array.from({ length: 9 }, (_, i) => i + 3);

  return (
    <div className="relative mx-auto select-none" style={{ width: 228 }}>

      {/* ── Callout: 진행선 ── */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ right: -10, top: 148 }}>
        <div className="bg-[#b5541e] text-[#fdf6e8] text-[9px] font-bold px-2 py-1 rounded-full shadow-sm whitespace-nowrap">
          {t('landing.feat.ruler')}
        </div>
        <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
          <path d="M16 5H2M6 1L2 5L6 9" stroke="#b5541e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Callout: 완료 표시 ── */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ left: -10, top: 110 }}>
        <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
          <path d="M2 5H16M12 1L16 5L12 9" stroke="#b5541e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="bg-[#b5541e] text-[#fdf6e8] text-[9px] font-bold px-2 py-1 rounded-full shadow-sm whitespace-nowrap">
          {t('landing.mockup.completedMark')}
        </div>
      </div>

      {/* ── Callout: 단수 카운터 ── */}
      <div className="absolute z-10 flex items-center gap-1.5" style={{ left: -10, bottom: 70 }}>
        <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
          <path d="M2 5H16M12 1L16 5L12 9" stroke="#b5541e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="bg-[#b5541e] text-[#fdf6e8] text-[9px] font-bold px-2 py-1 rounded-full shadow-sm whitespace-nowrap">
          {t('landing.feat.counter')}
        </div>
      </div>

      {/* ── Phone frame ── */}
      <div
        className="bg-[#2a1d15] rounded-[2.5rem] shadow-[0_28px_70px_rgba(61,43,31,0.35),0_8px_24px_rgba(61,43,31,0.2)]"
        style={{ padding: 7 }}
      >
        <div className="bg-[#faf9f7] rounded-[2rem] overflow-hidden">

          {/* Status notch */}
          <div className="h-6 bg-[#f5edd6] flex items-center justify-center">
            <div className="w-16 h-1 bg-[#3d2b1f] rounded-full opacity-20" />
          </div>

          {/* App header */}
          <div className="bg-[#f5edd6] border-b-2 border-[#d4b896] px-2.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M7 2L3 5L7 8" stroke="#7a5c46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-[#3d2b1f] tracking-tight">{t('landing.mockup.patternName')}</span>
                  <span className="text-[7px] font-bold bg-[#3d2b1f] text-[#fdf6e8] px-1 py-0.5 rounded leading-none">{t('card.type.knitting')}</span>
                </div>
                <p className="text-[7px] text-[#a08060]">메리노 · 4mm</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <div className="w-5 h-5 flex items-center justify-center rounded bg-[#ede5cc]">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M8.5 1.5l2 2L3 11H1v-2L8.5 1.5z" stroke="#7a5c46" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="w-5 h-5 flex items-center justify-center rounded">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M2 5H7a3 3 0 110 6H5M2 5L4 3M2 5L4 7" stroke="#7a5c46" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="w-5 h-5 flex items-center justify-center rounded">
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M2 5H7a3 3 0 100 6H5M2 5L4 3M2 5L4 7" stroke="#7a5c46" strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Pattern viewer */}
          <div className="relative bg-[#fdf6e8] overflow-hidden" style={{ height: 198 }}>

            {/* Pattern rows */}
            {visibleRows.map((row) => {
              const isCompleted = row < currentRow;
              const isCurrent = row === currentRow;
              return (
                <div
                  key={row}
                  className="flex items-center px-2"
                  style={{ height: 22, background: isCurrent ? 'rgba(181,84,30,0.07)' : undefined }}
                >
                  <span
                    className="text-right mr-1.5 shrink-0 tabular-nums"
                    style={{ fontSize: 7, width: 14, color: isCompleted ? '#b5541e' : '#c4a882', opacity: isCompleted ? 0.7 : 1 }}
                  >
                    {row}
                  </span>
                  <svg width="100%" height="13" viewBox="0 0 190 13" preserveAspectRatio="none" fill="none">
                    <path
                      d={STITCH_PATH}
                      stroke={isCompleted ? '#b5541e' : isCurrent ? '#b5541e' : '#c4a882'}
                      strokeOpacity={isCompleted ? 0.35 : isCurrent ? 1 : 0.65}
                      strokeWidth={isCurrent ? 2.2 : 1.6}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                    {(isCompleted || isCurrent) && (
                      <path
                        d={STITCH_PATH2}
                        stroke="#b5541e"
                        strokeOpacity={isCompleted ? 0.18 : 0.45}
                        strokeWidth={isCurrent ? 2.2 : 1.6}
                        strokeLinecap="round" strokeLinejoin="round"
                      />
                    )}
                  </svg>
                  {isCompleted && (
                    <div
                      className="ml-1 shrink-0 rounded-full bg-[#b5541e] flex items-center justify-center"
                      style={{ width: 12, height: 12 }}
                    >
                      <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
                        <path d="M1.5 3.5L3 5L5.5 1.5" stroke="#fdf6e8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ruler overlay */}
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: 4 * 22, height: 22 }}
            >
              <div className="absolute inset-0 border-y-2 border-[#b5541e]" style={{ background: 'rgba(181,84,30,0.12)' }} />
              {/* drag handle */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center" style={{ width: 14, height: 28 }}>
                <div className="rounded-full bg-[#b5541e]" style={{ width: 4, height: 22 }} />
              </div>
            </div>
          </div>

          {/* Sub-pattern tabs */}
          <div className="bg-[#f5edd6] border-t-2 border-[#d4b896] flex gap-1 px-2 py-1.5">
            <div className="bg-[#b5541e] text-[#fdf6e8] rounded px-2 py-1 leading-none">
              <p className="font-bold" style={{ fontSize: 8 }}>{t('sub.defaultPrefix')} 1</p>
              <p style={{ fontSize: 7, opacity: 0.85 }}>{t('sub.rowDisplay', { current: 7, total: 40 })}</p>
            </div>
            <div className="bg-[#ede5cc] text-[#7a5c46] rounded px-2 py-1 leading-none">
              <p className="font-bold" style={{ fontSize: 8 }}>{t('sub.defaultPrefix')} 2</p>
              <p style={{ fontSize: 7 }}>{t('sub.rowDisplay', { current: 0, total: 25 })}</p>
            </div>
          </div>

          {/* Row counter */}
          <div className="bg-[#fdf6e8] border-t-2 border-[#d4b896] px-3 pt-2 pb-1.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-[#d4b896] bg-[#f5edd6]">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M6.5 2L3.5 5L6.5 8" stroke="#7a5c46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-center leading-none">
                <span className="font-bold text-[#3d2b1f]" style={{ fontSize: 26 }}>7</span>
                <span className="text-[#a08060] ml-0.5" style={{ fontSize: 10 }}>{t('counter.rowOf', { total: totalRows })}</span>
              </div>
              <div className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-[#d4b896] bg-[#f5edd6]">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3.5 2L6.5 5L3.5 8" stroke="#7a5c46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            {/* progress bar */}
            <div className="h-1 bg-[#d4b896] rounded-full overflow-hidden">
              <div className="h-full bg-[#b5541e] rounded-full" style={{ width: `${(currentRow / totalRows) * 100}%` }} />
            </div>
          </div>

          {/* Complete button */}
          <div className="px-2 pb-2.5 bg-[#fdf6e8]">
            <div
              className="w-full bg-[#b5541e] text-[#fdf6e8] rounded-lg flex items-center justify-center font-bold border-2 border-[#9a4318]"
              style={{ height: 32, fontSize: 9, letterSpacing: '0.05em', boxShadow: '2px 2px 0 #9a4318' }}
            >
              {t('ruler.complete')}
            </div>
          </div>

          {/* Home indicator */}
          <div className="h-5 bg-[#fdf6e8] flex items-center justify-center">
            <div className="w-20 h-1 bg-[#3d2b1f] rounded-full opacity-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-5 sm:px-8 h-14 flex items-center justify-between border-b-2 border-[#d4b896] bg-[#f5edd6]">
        <div className="flex items-center gap-2">
          <KottaIcon size={22} color="#b5541e" opacity2={0.4} />
          <span className="font-bold text-[#3d2b1f] tracking-tight text-lg">{t('app.name')}</span>
          <span className="text-[9px] font-bold tracking-wider text-[#b5541e] border border-[#b5541e]/40 rounded px-1 py-0.5 leading-none">beta</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            to="/login"
            className="text-sm text-[#7a5c46] hover:text-[#3d2b1f] transition-colors min-h-[44px] flex items-center tracking-wide"
          >
            {t('nav.login')}
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center px-5 text-center py-12 sm:py-16">
        {/* Hero icon */}
        <div className="mb-6">
          <KottaIcon size={64} color="#b5541e" opacity2={0.35} />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 border-2 border-[#d4b896] rounded-full px-4 py-1.5 mb-8">
          <svg width="12" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M0,4 L2.5,0 L5,4 L7.5,0 L10,4" stroke="#b5541e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.18em] text-[#b5541e] uppercase">Knitting Tracker</span>
          <svg width="12" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M0,4 L2.5,0 L5,4 L7.5,0 L10,4" stroke="#b5541e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>

        {/* Headline */}
        <h1 className="text-[2.8rem] sm:text-6xl font-bold text-[#3d2b1f] leading-[1.1] tracking-tight mb-5">
          {t('landing.hero1')}
          <br />
          <span className="text-[#b5541e]">{t('landing.hero2')}</span>
        </h1>

        <p className="text-[15px] sm:text-base text-[#7a5c46] max-w-[260px] sm:max-w-xs leading-relaxed mb-10">
          {t('landing.sub1')}<br />
          {t('landing.sub2')}
        </p>

        {/* CTA */}
        <Link
          to="/login"
          className="inline-flex items-center gap-2.5 bg-[#b5541e] text-[#fdf6e8] px-7 py-3.5 rounded-lg text-sm font-semibold tracking-wide hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[3px_3px_0_#9a4318]"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {t('landing.cta')}
        </Link>

        <StitchDivider />

        {/* App mockup */}
        <div className="mb-2 px-16">
          <AppMockup />
        </div>

        <StitchDivider />

        {/* Features */}
        <div className="grid grid-cols-2 gap-2.5 max-w-xs w-full">
          {[
            { label: t('landing.feat.imagePdf'), desc: t('landing.feat.imagePdfDesc') },
            { label: t('landing.feat.ruler'), desc: t('landing.feat.rulerDesc') },
            { label: t('landing.feat.counter'), desc: t('landing.feat.counterDesc') },
            { label: t('landing.feat.save'), desc: t('landing.feat.saveDesc') },
          ].map((f) => (
            <div
              key={f.label}
              className="bg-[#fdf6e8] border-2 border-[#d4b896] rounded-lg px-3 py-2.5 text-left"
            >
              <p className="text-[11px] font-bold tracking-wide text-[#3d2b1f] uppercase">{f.label}</p>
              <p className="text-[10px] text-[#a08060] mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="py-5 text-center text-[11px] text-[#a08060] border-t-2 border-[#d4b896] space-y-1.5">
        <p>{t('footer.copyright')}</p>
        <p className="flex items-center justify-center gap-3">
          <a
            href="https://www.instagram.com/kotta_knitting/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#b5541e] transition-colors underline underline-offset-2"
          >
            {t('footer.business')}
          </a>
          <span className="text-[#d4b896]">·</span>
          <a
            href="https://www.instagram.com/kotta_knitting/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#b5541e] transition-colors underline underline-offset-2"
          >
            {t('footer.bug')}
          </a>
        </p>
      </footer>
    </div>
  );
}
