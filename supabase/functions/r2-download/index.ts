const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Admin-only: verify the token has service_role claim
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let role: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      role = payload.role;
    } catch {
      // invalid JWT
    }
    if (role !== 'service_role') {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { url, filename } = await req.json() as { url: string; filename: string };
    if (!url || !filename) {
      return new Response('Missing url or filename', { status: 400, headers: corsHeaders });
    }

    // Fetch from R2 server-side (no CORS restrictions)
    const r2Res = await fetch(url);
    if (!r2Res.ok) {
      return new Response(`R2 fetch failed: ${r2Res.status}`, { status: r2Res.status, headers: corsHeaders });
    }

    const contentType = r2Res.headers.get('content-type') || 'application/octet-stream';
    const body = await r2Res.arrayBuffer();

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(body.byteLength),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('r2-download error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
