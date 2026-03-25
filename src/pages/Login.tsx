import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

function isInAppBrowser() {
  const ua = navigator.userAgent;
  return /KAKAOTALK|Instagram|Threads|Barcelona|FBAN|FBAV|Line|Twitter|Snapchat|Musical\.ly|TikTok|LinkedInApp|Bytedance/i.test(ua)
    || (/Android/.test(ua) && !/Chrome\/[.0-9]*/.test(ua) && /Version\//.test(ua));
}

export default function Login() {
  const supabase = createClient();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const inApp = isInAppBrowser();
  const [guestLoading, setGuestLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const siteUrl = 'https://kis.marihoworld.com';

  const handleCopyUrl = () => {
    const copy = () => {
      try {
        const el = document.createElement('textarea');
        el.value = siteUrl;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        alert(t('login.copyError', { url: siteUrl }));
      }
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(siteUrl)
        .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
        .catch(copy);
    } else {
      copy();
    }
  };

  const handleGoogleLogin = async () => {
    const siteUrl = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: siteUrl,
      },
    });
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (!error) {
      navigate('/dashboard', { replace: true });
    } else {
      alert(t('login.guestFailed'));
    }
    setGuestLoading(false);
  };


  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="px-5 sm:px-8 h-14 flex items-center border-b-2 border-[#b07840]">
        <Link to="/" className="flex items-center gap-2.5">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <path d="M0,6 L4.5,0 L9,6 L13.5,0 L18,6" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M0,12 L4.5,6 L9,12 L13.5,6 L18,12" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="font-bold text-[#3d2b1f] tracking-tight">{t('app.name')}</span>
          <span className="text-[9px] font-bold tracking-wider text-[#b5541e] border border-[#b5541e]/40 rounded px-1 py-0.5 leading-none">beta</span>
        </Link>
      </nav>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl shadow-[4px_4px_0_#b07840] p-7 sm:p-9 w-full max-w-sm">
          {/* Logo area */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-[#f5edd6] border-2 border-[#b07840] mb-4">
              <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b5541e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#3d2b1f] tracking-tight">{t('login.welcome')}</h1>
            <p className="text-sm text-[#7a5c46] mt-1.5">{t('login.subtitle')}</p>
          </div>

          {/* Stitch divider */}
          <div className="flex items-center gap-1 justify-center mb-7">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} width="10" height="7" viewBox="0 0 10 7" fill="none">
                <path d="M0,3.5 L2.5,0 L5,3.5 L7.5,0 L10,3.5" stroke="#b07840" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            ))}
          </div>

          {inApp ? (
            <div className="flex flex-col gap-3">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-lg px-4 py-4 text-sm text-amber-800 text-center leading-relaxed">
                <p className="font-bold mb-2">{t('login.inAppBrowserTitle')}</p>
                <p className="text-xs text-amber-700" style={{ whiteSpace: 'pre-line' }}>{t('login.inAppBrowserDesc')}</p>
                <p className="text-xs text-amber-600 mt-2 font-medium">kis.marihoworld.com</p>
              </div>
              <button
                onClick={handleCopyUrl}
                className="w-full flex items-center justify-center gap-2 bg-[#fdf6e8] text-[#7a5c46] border-2 border-[#b07840] rounded-lg px-4 py-3 min-h-[48px] text-sm font-medium tracking-wide hover:bg-[#f5edd6] transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {copied ? t('login.copied') : t('login.copyUrl')}
              </button>
              <button
                onClick={handleGuestLogin}
                disabled={guestLoading}
                className="w-full flex items-center justify-center gap-2 bg-[#fdf6e8] text-[#7a5c46] border-2 border-[#b07840] rounded-lg px-4 py-3 min-h-[48px] text-sm font-medium tracking-wide hover:bg-[#f5edd6] transition-all disabled:opacity-50"
              >
                {guestLoading ? (
                  <div className="w-4 h-4 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                {t('login.guestStart')}
              </button>
              <p className="text-[10px] text-[#a08060] text-center leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{t('login.guestDataWarning')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-[#3d2b1f] text-[#fdf6e8] border-2 border-[#3d2b1f] rounded-lg px-4 py-3 min-h-[48px] text-sm font-semibold tracking-wide hover:bg-[#2a1d15] transition-all shadow-[3px_3px_0_#7a5c46] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t('login.google')}
              </button>

              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-[#d4b896]" />
                <span className="text-[11px] text-[#a08060]">{t('login.or')}</span>
                <div className="flex-1 h-px bg-[#d4b896]" />
              </div>

              <button
                onClick={handleGuestLogin}
                disabled={guestLoading}
                className="w-full flex items-center justify-center gap-2 bg-[#fdf6e8] text-[#7a5c46] border-2 border-[#b07840] rounded-lg px-4 py-3 min-h-[48px] text-sm font-medium tracking-wide hover:bg-[#f5edd6] transition-all disabled:opacity-50"
              >
                {guestLoading ? (
                  <div className="w-4 h-4 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                {t('login.guestUse')}
              </button>
              <p className="text-[10px] text-[#a08060] text-center leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{t('login.guestDataWarning')}</p>
            </div>
          )}
        </div>
      </main>

      <footer className="py-5 text-center text-[11px] text-[#a08060] border-t-2 border-[#b07840]">
        {t('footer.copyright')}
      </footer>
    </div>
  );
}
