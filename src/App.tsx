import { HashRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import PatternNew from './pages/PatternNew';
import PatternView from './pages/PatternView';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patterns/new" element={<PatternNew />} />
        <Route path="/patterns/:id" element={<PatternView />} />
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  );
}
