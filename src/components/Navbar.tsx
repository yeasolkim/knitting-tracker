import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Navbar({ userEmail }: { userEmail?: string }) {
  const navigate = useNavigate();
  const supabase = createClient();
  const { t } = useLanguage();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="border-b-2 border-[#b07840] bg-[#f5edd6] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to={userEmail ? '/dashboard' : '/'} className="flex items-center gap-2.5 min-h-[44px]">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
            <path d="M0,6 L4.5,0 L9,6 L13.5,0 L18,6" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <path d="M0,12 L4.5,6 L9,12 L13.5,6 L18,12" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span className="font-bold text-[#3d2b1f] tracking-tight">{t('app.name')}</span>
          <span className="text-[9px] font-bold tracking-wider text-[#b5541e] border border-[#b5541e]/40 rounded px-1 py-0.5 leading-none">beta</span>
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-3 sm:gap-5">
            <span className="text-[11px] text-[#a08060] hidden sm:block truncate max-w-[140px] tracking-wide">{userEmail}</span>
            <button
              onClick={handleLogout}
              className="text-xs text-[#7a5c46] hover:text-[#3d2b1f] transition-colors min-h-[44px] px-1 flex items-center tracking-wide"
            >
              {t('nav.logout')}
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="text-xs font-semibold text-[#b5541e] hover:text-[#9a4318] tracking-wide transition-colors min-h-[44px] flex items-center"
          >
            {t('nav.start')}
          </Link>
        )}
      </div>
    </nav>
  );
}
