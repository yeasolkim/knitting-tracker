import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtraPatternFile } from './types';

/**
 * Duplicated patterns share the same storage URLs as their source. Before deleting
 * objects from storage, drop every URL that is still referenced by another pattern
 * of the same user. On any query failure we return [] (never delete on uncertainty).
 */
export async function filterUnreferencedUrls(
  supabase: SupabaseClient,
  userId: string,
  urls: string[],
  excludePatternId: string,
): Promise<string[]> {
  const candidates = [...new Set(urls.filter(Boolean))];
  if (candidates.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from('patterns')
      .select('id,file_url,thumbnail_url,extra_image_urls')
      .eq('user_id', userId)
      .neq('id', excludePatternId);
    if (error || !data) return [];
    const referenced = new Set<string>();
    for (const row of data) {
      if (row.file_url) referenced.add(row.file_url as string);
      if (row.thumbnail_url) referenced.add(row.thumbnail_url as string);
      for (const f of ((row.extra_image_urls as ExtraPatternFile[] | null) ?? [])) {
        if (f?.url) referenced.add(f.url);
        if (f?.thumbnail_url) referenced.add(f.thumbnail_url);
      }
    }
    return candidates.filter((u) => !referenced.has(u));
  } catch {
    return [];
  }
}
