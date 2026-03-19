import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { createClient } from './lib/supabase/client';

// Handle Supabase OAuth callback
// Supabase redirects to /auth/callback#access_token=...
// We need to detect this and let Supabase client pick up the token,
// then redirect to the app's hash router
const path = window.location.pathname;
const basePath = '/knitting-tracker';

if (path === `${basePath}/auth/callback` || path === `${basePath}/auth/callback/`) {
  const supabase = createClient();
  // Supabase automatically detects the hash fragment and sets the session
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      // Redirect to dashboard via hash router
      window.location.replace(`${basePath}/#/dashboard`);
    }
  });
  // Fallback: check if session already exists after a short delay
  setTimeout(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.replace(`${basePath}/#/dashboard`);
      } else {
        window.location.replace(`${basePath}/#/login`);
      }
    });
  }, 2000);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
