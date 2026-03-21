import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Verify Supabase JWT using service role key (required for server-side verification)
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { path, contentType } = await req.json();
    if (!path || !contentType) {
      return new Response('Missing path or contentType', { status: 400, headers: corsHeaders });
    }

    if (!path.startsWith(`${user.id}/`)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const accountId = Deno.env.get('R2_ACCOUNT_ID')!;
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('R2_BUCKET_NAME')!;
    const publicUrl = Deno.env.get('R2_PUBLIC_URL')!;

    const aws = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto',
    });

    // R2 S3-compatible endpoint (virtual-hosted style)
    const endpoint = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${path}`;
    const url = new URL(endpoint);
    url.searchParams.set('X-Amz-Expires', '300');

    const signed = await aws.sign(
      new Request(url.toString(), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      }),
      { aws: { signQuery: true } }
    );

    const presignedUrl = signed.url;
    const fileUrl = `${publicUrl.replace(/\/$/, '')}/${path}`;

    return new Response(JSON.stringify({ presignedUrl, fileUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('r2-presign error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
