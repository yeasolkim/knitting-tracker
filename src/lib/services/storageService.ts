import { createClient } from '@/lib/supabase/client';

const supabase = createClient();
const BUCKET = 'pattern-files';

export async function uploadPatternFile(
  userId: string,
  patternId: string,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${userId}/${patternId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePatternFiles(
  userId: string,
  patternId: string
): Promise<void> {
  const { data: files } = await supabase.storage
    .from(BUCKET)
    .list(`${userId}/${patternId}`);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${patternId}/${f.name}`);
    await supabase.storage.from(BUCKET).remove(paths);
  }
}
