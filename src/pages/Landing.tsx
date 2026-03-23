import { Link } from 'react-router-dom';
import { useLanguage, LanguageToggle } from '@/contexts/LanguageContext';

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

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-5 sm:px-8 h-14 flex items-center justify-between border-b-2 border-[#d4b896] bg-[#f5edd6]">
        <span className="font-bold text-[#3d2b1f] tracking-tight text-lg">{t('app.name')}</span>
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

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 text-center -mt-4">
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
