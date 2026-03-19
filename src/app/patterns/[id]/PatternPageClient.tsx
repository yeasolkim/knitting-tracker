'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import PatternViewerClient from './PatternViewerClient';

export default function PatternPageClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [pattern, setPattern] = useState<PatternWithProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('patterns')
        .select(`
          *,
          progress:pattern_progress(*)
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        router.push('/dashboard');
        return;
      }

      setPattern({
        ...data,
        progress: data.progress?.[0] || null,
      } as PatternWithProgress);
      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !pattern) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <div className="w-8 h-8 border-2 border-rose-300 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <PatternViewerClient pattern={pattern} />;
}
