'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import PatternCard from '@/components/PatternCard';

export default function DashboardClient() {
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

  const handleDelete = async (id: string) => {
    const pattern = patterns.find((p) => p.id === id);
    if (!pattern) return;

    // Delete files from storage
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: files } = await supabase.storage
        .from('pattern-files')
        .list(`${user.id}/${id}`);
      if (files && files.length > 0) {
        await supabase.storage
          .from('pattern-files')
          .remove(files.map((f) => `${user.id}/${id}/${f.name}`));
      }
    }

    await supabase.from('pattern_progress').delete().eq('pattern_id', id);
    await supabase.from('patterns').delete().eq('id', id);
    setPatterns((prev) => prev.filter((p) => p.id !== id));
  };

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
          href="/patterns/new"
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
