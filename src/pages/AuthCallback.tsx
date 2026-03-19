import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        navigate('/dashboard');
      } else if (event === 'SIGNED_OUT') {
        navigate('/login');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/dashboard');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  );
}
