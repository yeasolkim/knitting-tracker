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

// Handles PKCE OAuth callback: Supabase sends ?code= to the root URL
// because HashRouter can't use a hash path as redirectTo
function OAuthHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      window.history.replaceState({}, '', window.location.pathname);
      if (!error) navigate('/dashboard', { replace: true });
      else navigate('/login', { replace: true });
    });
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
