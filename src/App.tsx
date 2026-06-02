import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { createClient } from './lib/supabase/client';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PatternNew = lazy(() => import('./pages/PatternNew'));
const PatternEdit = lazy(() => import('./pages/PatternEdit'));
const PatternView = lazy(() => import('./pages/PatternView'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

// Handles OAuth callback for HashRouter:
// - PKCE flow: detectSessionInUrl:true 가 자동으로 code 교환 → SIGNED_IN 이벤트 수신
// - Implicit flow: #access_token= 을 수동으로 처리 (HashRouter 충돌 방지)
function OAuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = createClient();

    // Implicit: #access_token= in hash
    const rawHash = window.location.hash.replace(/^#/, '');
    const hashParams = new URLSearchParams(rawHash);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (accessToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken ?? '' })
        .then(({ error }) => {
          window.history.replaceState({}, '', window.location.pathname);
          if (!error) navigate('/dashboard', { replace: true });
          else navigate('/login', { replace: true });
        });
      return;
    }

    // PKCE: ?code= in query string
    // Supabase(detectSessionInUrl:true)가 자동으로 교환 처리하므로
    // SIGNED_IN 이벤트만 수신해서 대시보드로 이동
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (!code) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.history.replaceState({}, '', window.location.pathname);
        navigate('/dashboard', { replace: true });
      }
    });

    // 10초 내 SIGNED_IN 없으면 현재 세션 확인 후 처리
    const timeout = setTimeout(async () => {
      subscription.unsubscribe();
      const { data } = await supabase.auth.getSession();
      window.history.replaceState({}, '', window.location.pathname);
      if (data.session) navigate('/dashboard', { replace: true });
      else navigate('/login', { replace: true });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  return null;
}

// Global offline banner + sync manager — renders nothing visible when online
function OfflineManager() {
  const isOnline = useOnlineStatus();
  const { status: syncStatus, retry: retrySync, conflictCount, clearConflict } = useOfflineSync();
  const { t } = useLanguage();

  return (
    <>
      {/* Top banner */}
      {(!isOnline || (isOnline && syncStatus !== 'idle')) && (
        <div className="fixed top-0 inset-x-0 z-[100] pointer-events-none">
          {!isOnline && (
            <div className="bg-[#3d2b1f] text-[#fdf6e8] text-[11px] font-medium text-center py-1.5 tracking-wide">
              {t('offline.banner')}
            </div>
          )}
          {isOnline && syncStatus === 'syncing' && (
            <div className="bg-[#b07840] text-[#fdf6e8] text-[11px] font-medium text-center py-1.5 tracking-wide flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#fdf6e8] animate-pulse" />
              {t('offline.syncing')}
            </div>
          )}
          {isOnline && syncStatus === 'done' && (
            <div className="bg-[#5a8a5a] text-[#fdf6e8] text-[11px] font-medium text-center py-1.5 tracking-wide">
              {t('offline.syncDone')}
            </div>
          )}
          {isOnline && syncStatus === 'error' && (
            <div className="bg-[#b5541e] text-[#fdf6e8] text-[11px] font-medium text-center py-1.5 tracking-wide flex items-center justify-center gap-2 pointer-events-auto">
              {t('offline.syncError')}
              <button
                onClick={retrySync}
                className="underline underline-offset-2 hover:opacity-80 active:opacity-60 transition-opacity"
              >
                {t('offline.syncErrorRetry')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Conflict popup */}
      {conflictCount > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-2xl shadow-xl max-w-sm w-full p-5 flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="font-bold text-sm text-[#3d2b1f] leading-snug">{t('offline.conflictPopup.title')}</p>
                <p className="text-xs text-[#7a5c46] mt-1.5 leading-relaxed">{t('offline.conflictPopup.desc')}</p>
              </div>
            </div>
            <button
              onClick={clearConflict}
              className="self-end text-xs font-bold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] rounded-lg px-4 py-2 hover:bg-[#9a4318] transition-colors"
            >
              {t('offline.conflictPopup.close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FallbackRedirect() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      navigate(session ? '/dashboard' : '/login', { replace: true });
      setChecked(true);
    });
  }, [navigate]);

  return checked ? null : null;
}

// Passes current path as resetKey so ErrorBoundary resets on navigation
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <OAuthHandler />
      <OfflineManager />
      <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patterns/new" element={<PatternNew />} />
        <Route path="/patterns/:id/edit" element={<PatternEdit />} />
        <Route path="/patterns/:id" element={<PatternView />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        {/* 미매칭 경로(광고 등으로 hash 변조 시) → 세션 있으면 dashboard, 없으면 login */}
        <Route path="*" element={<FallbackRedirect />} />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </LanguageProvider>
  );
}
