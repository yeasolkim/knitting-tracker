import { createClient } from '@/lib/supabase/client';
import type { PatternProgress } from '@/lib/types';

const supabase = createClient();

export async function getProgress(patternId: string): Promise<PatternProgress | null> {
  const { data, error } = await supabase
    .from('pattern_progress')
    .select('*')
    .eq('pattern_id', patternId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function upsertProgress(
  progress: Omit<PatternProgress, 'id' | 'updated_at'>
): Promise<PatternProgress> {
  const { data, error } = await supabase
    .from('pattern_progress')
    .upsert(progress, { onConflict: 'pattern_id,user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
