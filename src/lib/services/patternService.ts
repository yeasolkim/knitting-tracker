import { createClient } from '@/lib/supabase/client';
import type { Pattern, PatternWithProgress } from '@/lib/types';

const supabase = createClient();

export async function getPatterns(): Promise<PatternWithProgress[]> {
  const { data, error } = await supabase
    .from('patterns')
    .select(`
      *,
      progress:pattern_progress(*)
    `)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((p) => ({
    ...p,
    progress: p.progress?.[0] || null,
  }));
}

export async function getPattern(id: string): Promise<PatternWithProgress | null> {
  const { data, error } = await supabase
    .from('patterns')
    .select(`
      *,
      progress:pattern_progress(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    ...data,
    progress: data.progress?.[0] || null,
  };
}

export async function createPattern(
  pattern: Omit<Pattern, 'id' | 'created_at' | 'updated_at'>
): Promise<Pattern> {
  const { data, error } = await supabase
    .from('patterns')
    .insert(pattern)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePattern(id: string): Promise<void> {
  const { error } = await supabase.from('patterns').delete().eq('id', id);
  if (error) throw error;
}
