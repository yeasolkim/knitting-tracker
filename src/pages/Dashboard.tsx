import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import Navbar from '@/components/Navbar';
import AuthGuard from '@/components/AuthGuard';
import PatternCard from '@/components/PatternCard';

export default function Dashboard() {
  return (
    <AuthGuard>
      {(user) => (
        <div className="min-h-screen bg-gray-50/50">
          <Navbar userEmail={user.email} />

          <main className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-gray-800">내 도안</h1>
              <Link
                to="/patterns/new"
                className="inline-flex items-center gap-2 bg-rose-400 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-rose-500 transition-colors"
              >
                + 새 도안
              </Link>
            </div>

            <DashboardContent />
          </main>
        </div>
      )}
    </AuthGuard>
  );
}

function DashboardContent() {
  const [patterns, setPatterns] = useState<PatternWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchPatterns = async () => {
    const { data, error } = await supabase
      .from('patterns')
      .select(`
        *,
        progress:pattern_progress(*)
      `)
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
  };

  useEffect(() => {
    fetchPatterns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id));

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid = session.user.id;

      Promise.all([
        supabase.storage.from('pattern-files').list(`${uid}/${id}`).then(({ data: files }) => {
          if (files && files.length > 0) {
            return supabase.storage.from('pattern-files').remove(
              files.map((f: { name: string }) => `${uid}/${id}/${f.name}`)
            );
          }
        }),
        supabase.from('pattern_progress').delete().eq('pattern_id', id),
        supabase.from('patterns').delete().eq('id', id),
      ]);
    });
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-4">🧶</div>
        <h2 className="text-lg font-medium text-gray-600 mb-2">아직 도안이 없어요</h2>
        <p className="text-sm text-gray-400 mb-6">첫 도안을 업로드해 보세요!</p>
        <Link
          to="/patterns/new"
          className="inline-flex items-center gap-2 bg-rose-400 text-white px-6 py-2.5 rounded-full hover:bg-rose-500 transition-colors"
        >
          + 도안 추가
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {patterns.map((pattern) => (
        <PatternCard key={pattern.id} pattern={pattern} onDelete={handleDelete} />
      ))}
    </div>
  );
}
