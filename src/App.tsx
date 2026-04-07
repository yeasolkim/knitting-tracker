import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import PatternNew from './pages/PatternNew';
import PatternEdit from './pages/PatternEdit';
import PatternView from './pages/PatternView';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { createClient } from './lib/supabase/client';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useOnlineStatus } from './hooks/useOnlineStatus';

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
  const syncStatus = useOfflineSync();
  const { t } = useLanguage();

  if (isOnline && syncStatus === 'idle') return null;

  return (
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
    </div>
  );
}

// Passes current path as resetKey so ErrorBoundary resets on navigation
function AppRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <OAuthHandler />
      <OfflineManager />
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
        {/* 미매칭 경로(광고 팝업 등으로 hash 변조 시) → 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
