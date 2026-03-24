import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { translations, LANGUAGES, type Lang } from '@/lib/i18n';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const VALID_LANGS = LANGUAGES.map((l) => l.code);

function isValidLang(v: unknown): v is Lang {
  return VALID_LANGS.includes(v as Lang);
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ko',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('knitting_in_the_bath_lang') as Lang | null;
    return isValidLang(stored) ? stored : 'ko';
  });

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const metaLang = session?.user?.user_metadata?.language;
      if (isValidLang(metaLang)) {
        setLangState(metaLang);
        localStorage.setItem('knitting_in_the_bath_lang', metaLang);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const metaLang = session?.user?.user_metadata?.language;
      if (isValidLang(metaLang)) {
        setLangState(metaLang);
        localStorage.setItem('knitting_in_the_bath_lang', metaLang);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('knitting_in_the_bath_lang', newLang);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.auth.updateUser({ data: { language: newLang } });
      }
    });
  }, [supabase]);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let str = translations[lang][key] ?? translations['ko'][key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, String(v));
      }
    }
    return str;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-bold text-[#7a5c46] hover:text-[#3d2b1f] transition-colors min-h-[44px] px-1.5 tracking-wide"
        aria-expanded={open}
      >
        {/* Globe icon */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
          <ellipse cx="8" cy="8" rx="2.8" ry="6.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M2.5 5h11M2.5 11h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeOpacity="0.6"/>
        </svg>
        <span>{current.native}</span>
        {/* Chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-[#fdf6e8] border-2 border-[#d4b896] rounded-xl shadow-[3px_3px_0_#d4b896] z-50 overflow-hidden">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs tracking-wide transition-colors ${
                lang === l.code
                  ? 'bg-[#f5edd6] text-[#b5541e] font-bold'
                  : 'text-[#7a5c46] hover:bg-[#f5edd6] hover:text-[#3d2b1f] font-medium'
              }`}
            >
              <span>{l.native}</span>
              {lang === l.code && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="#b5541e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
