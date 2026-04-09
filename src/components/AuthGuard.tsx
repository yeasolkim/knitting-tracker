import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthGuardProps {
  children: (user: User, authLoading: boolean) => React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const supabase = createClient();

    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate('/login');
        return;
      }
      setUser(session.user);
      setLoading(false);
    });

    // 토큰 갱신/로그아웃 이벤트 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/login');
      } else if (session?.user) {
        setUser(session.user);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Pass authLoading down so each page can show its own skeleton immediately,
  // avoiding the flash of a generic spinner before the page-level skeleton.
  return <>{children(user ?? ({} as User), loading)}</>;
}
