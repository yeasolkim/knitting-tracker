import { DeleteObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';
import { createClient } from 'npm:@supabase/supabase-js';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID') ?? '',
    secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '',
  },
});

const BUCKET = Deno.env.get('R2_BUCKET_NAME') ?? '';
const PUBLIC_URL = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

function urlToKey(url: string): string | null {
  if (!url || !PUBLIC_URL) return null;
  if (!url.startsWith(PUBLIC_URL + '/')) return null;
  return decodeURIComponent(url.slice(PUBLIC_URL.length + 1));
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { urls } = await req.json() as { urls: string[] };

  const keys = [...new Set(urls)]
    .map(urlToKey)
    .filter((k): k is string => k !== null)
    .filter((k) => k.startsWith(user.id + '/')); // 본인 파일만 삭제 가능

  await Promise.allSettled(
    keys.map((key) =>
      r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    ),
  );

  return new Response(
    JSON.stringify({ deleted: keys }),
    { headers: { 'Content-Type': 'application/json', ...CORS } },
  );
});
