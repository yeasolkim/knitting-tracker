import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAdminClient } from '@/lib/supabase/adminClient';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

interface Pattern {
  id: string;
  user_id: string;
  title: string;
  file_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'users' | 'patterns'>('users');

  useEffect(() => {
    if (sessionStorage.getItem('admin_auth') !== 'true') {
      navigate('/admin');
      return;
    }

    const client = createAdminClient();

    Promise.all([
      client.auth.admin.listUsers(),
      client.from('patterns').select('*').order('created_at', { ascending: false }),
    ]).then(([usersRes, patternsRes]) => {
      if (usersRes.data) setUsers(usersRes.data.users as AdminUser[]);
      if (patternsRes.data) setPatterns(patternsRes.data as Pattern[]);
      setLoading(false);
    });
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    navigate('/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5edd6]">
        <div className="w-8 h-8 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5edd6]">
      {/* Nav */}
      <nav className="bg-[#f5edd6] border-b-2 border-[#b07840] px-5 h-14 flex items-center justify-between sticky top-0 z-10">
        <div>
          <span className="font-bold text-[#3d2b1f] tracking-tight">어드민</span>
          <span className="text-xs text-[#a08060] ml-2">니팅인더사우나</span>
        </div>
        <button onClick={handleLogout} className="text-xs text-[#7a5c46] hover:text-[#3d2b1f] transition-colors">
          로그아웃
        </button>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl p-4 shadow-[2px_2px_0_#b07840]">
            <p className="text-xs text-[#a08060] mb-1">총 회원</p>
            <p className="text-3xl font-bold text-[#3d2b1f]">{users.length}</p>
          </div>
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl p-4 shadow-[2px_2px_0_#b07840]">
            <p className="text-xs text-[#a08060] mb-1">총 도안</p>
            <p className="text-3xl font-bold text-[#3d2b1f]">{patterns.length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['users', 'patterns'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                tab === t
                  ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                  : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] hover:border-[#b5541e]'
              }`}
            >
              {t === 'users' ? `회원 (${users.length})` : `도안 (${patterns.length})`}
            </button>
          ))}
        </div>

        {/* Users */}
        {tab === 'users' && (
          <div className="flex flex-col gap-2">
            {users.map(u => (
              <div key={u.id} className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#3d2b1f]">{u.email}</p>
                  <p className="text-[11px] text-[#a08060] mt-0.5">
                    가입: {new Date(u.created_at).toLocaleDateString('ko-KR')}
                    {u.last_sign_in_at && (
                      <span className="ml-3">마지막 로그인: {new Date(u.last_sign_in_at).toLocaleDateString('ko-KR')}</span>
                    )}
                  </p>
                </div>
                <span className="text-[10px] text-[#a08060] font-mono truncate max-w-[80px]">{u.id.slice(0, 8)}…</span>
              </div>
            ))}
          </div>
        )}

        {/* Patterns */}
        {tab === 'patterns' && (
          <div className="flex flex-col gap-2">
            {patterns.map(p => {
              const owner = users.find(u => u.id === p.user_id);
              return (
                <div key={p.id} className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#3d2b1f] truncate">{p.title || '(제목 없음)'}</p>
                      <p className="text-[11px] text-[#a08060] mt-0.5">
                        {owner?.email ?? p.user_id.slice(0, 8) + '…'}
                        <span className="mx-1.5">·</span>
                        {new Date(p.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    {p.file_url && (
                      <a
                        href={p.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-bold text-[#b5541e] border-2 border-[#b5541e] rounded-lg px-3 py-1.5 hover:bg-[#b5541e] hover:text-[#fdf6e8] transition-all"
                      >
                        열기
                      </a>
                    )}
                  </div>
                  {p.thumbnail_url && (
                    <img
                      src={p.thumbnail_url}
                      alt={p.title}
                      className="mt-2 h-16 rounded-lg object-cover border border-[#b07840]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
