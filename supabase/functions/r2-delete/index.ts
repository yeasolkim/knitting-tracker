import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 경로 우회 차단: 빈 세그먼트, '.', '..', 역슬래시, 제어문자, '?', '#' 거부
function isSafeKey(key: string): boolean {
  if (/[\\\x00-\x1f?#]/.test(key)) return false;
  return key.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // r2-presign과 동일한 인증 방식
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { urls } = await req.json() as { urls: string[] };
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response('Missing urls', { status: 400, headers: corsHeaders });
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID')!;
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('R2_BUCKET_NAME')!;
    const publicUrl = (Deno.env.get('R2_PUBLIC_URL') ?? '').replace(/\/$/, '');

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    });

    // URL → R2 key 변환
    function urlToKey(url: string): string | null {
      if (!url || !publicUrl) return null;
      if (!url.startsWith(publicUrl + '/')) return null;
      return decodeURIComponent(url.slice(publicUrl.length + 1));
    }

    const keys = [...new Set(urls)]
      .map(urlToKey)
      .filter((k): k is string => k !== null)
      .filter((k) => k.startsWith(user.id + '/')) // 본인 파일만
      .filter(isSafeKey); // ../ 등으로 다른 사용자 경로에 닿는 키 차단

    const results = await Promise.allSettled(
      keys.map((key) => {
        // r2-presign과 동일한 virtual-hosted 엔드포인트
        const endpoint = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
        return aws.fetch(endpoint, { method: 'DELETE' });
      }),
    );

    const deleted = keys.filter((_, i) => results[i].status === 'fulfilled');
    const failed = keys.filter((_, i) => results[i].status === 'rejected');

    return new Response(
      JSON.stringify({ deleted, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('r2-delete error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
