import { HashRouter, Routes, Route } from 'react-router-dom';
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

export default function App() {
  return (
    <ErrorBoundary>
    <LanguageProvider>
    <HashRouter>
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
