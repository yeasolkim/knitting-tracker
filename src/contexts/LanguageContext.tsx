import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { translations, type Lang } from '@/lib/i18n';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ko',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('kotta_lang') as Lang | null;
    return stored === 'en' ? 'en' : 'ko';
  });

  const supabase = useMemo(() => createClient(), []);

  // Sync language from Supabase user metadata on session load / auth change
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const metaLang = session?.user?.user_metadata?.language as Lang | undefined;
      if (metaLang === 'ko' || metaLang === 'en') {
        setLangState(metaLang);
        localStorage.setItem('kotta_lang', metaLang);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const metaLang = session?.user?.user_metadata?.language as Lang | undefined;
      if (metaLang === 'ko' || metaLang === 'en') {
        setLangState(metaLang);
        localStorage.setItem('kotta_lang', metaLang);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('kotta_lang', newLang);
    // Fire-and-forget: save to Supabase metadata if logged in
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
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setLang('ko')}
        className={`text-xs font-bold px-1.5 py-1 min-h-[44px] transition-colors tracking-wide ${
          lang === 'ko' ? 'text-[#3d2b1f]' : 'text-[#c4a882] hover:text-[#7a5c46]'
        }`}
      >
        KO
      </button>
      <span className="text-[#d4b896] text-xs select-none">|</span>
      <button
        onClick={() => setLang('en')}
        className={`text-xs font-bold px-1.5 py-1 min-h-[44px] transition-colors tracking-wide ${
          lang === 'en' ? 'text-[#3d2b1f]' : 'text-[#c4a882] hover:text-[#7a5c46]'
        }`}
      >
        EN
      </button>
    </div>
  );
}
