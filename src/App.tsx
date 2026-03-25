import { useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import PatternNew from './pages/PatternNew';
import PatternEdit from './pages/PatternEdit';
import PatternView from './pages/PatternView';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider } from './contexts/LanguageContext';
import { createClient } from './lib/supabase/client';

// Handles OAuth callback for HashRouter:
// - PKCE flow: Supabase sends ?code= as query param to root URL
// - Implicit flow: Supabase sends #access_token= as hash to root URL
function OAuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = createClient();

    // PKCE: ?code= in query string
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        window.history.replaceState({}, '', window.location.pathname);
        if (!error) navigate('/dashboard', { replace: true });
        else navigate('/login', { replace: true });
      });
      return;
    }

    // Implicit: #access_token= in hash (hash starts with access_token, not a route)
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
    }
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
    <LanguageProvider>
    <HashRouter>
      <OAuthHandler />
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
      </Routes>
    </HashRouter>
    </LanguageProvider>
    </ErrorBoundary>
  );
}
