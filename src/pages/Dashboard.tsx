import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import AuthGuard from '@/components/AuthGuard';
import PatternCard from '@/components/PatternCard';

export default function Dashboard() {
  return (
    <AuthGuard>
      {(user) => <DashboardPage userEmail={user.email} />}
    </AuthGuard>
  );
}

function DashboardPage({ userEmail }: { userEmail?: string }) {
  const navigate = useNavigate();
  const supabase = useMemo(() => createClient(), []);
  const [patterns, setPatterns] = useState<PatternWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPatterns = useCallback(async () => {
    const { data, error } = await supabase
      .from('patterns')
      .select('*, progress:pattern_progress(*)')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setPatterns(
        data.map((p: Record<string, unknown>) => ({
          ...p,
          progress: (p.progress as unknown[])?.[0] || null,
        })) as PatternWithProgress[]
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const handleDelete = useCallback(async (id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await Promise.all([
      supabase.from('pattern_progress').delete().eq('pattern_id', id),
      supabase.from('patterns').delete().eq('id', id),
    ]);
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {/* Nav */}
      <nav className="bg-[#faf9f7] border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="font-bold text-gray-900 tracking-tight">
            코따
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[160px]">
              {userEmail}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors min-h-[44px] flex items-center"
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">내 도안</h1>
            {!loading && patterns.length > 0 && (
              <p className="text-sm text-gray-400 mt-0.5">{patterns.length}개</p>
            )}
          </div>
          <Link
            to="/patterns/new"
            className="inline-flex items-center gap-1.5 bg-rose-400 text-white px-4 py-2.5 rounded-full text-sm font-medium hover:bg-rose-500 active:bg-rose-600 transition-colors min-h-[44px]"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            도안 추가
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : patterns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
              <svg className="w-7 h-7 text-rose-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-1">아직 도안이 없어요</p>
            <p className="text-sm text-gray-400 mb-6">첫 도안을 올려보세요</p>
            <Link
              to="/patterns/new"
              className="text-sm text-rose-400 hover:text-rose-500 font-medium transition-colors"
            >
              도안 추가하기 →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
