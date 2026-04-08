import JSZip from 'npm:jszip@3';

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

    const body = await req.json() as
      | { urls: string[]; filename: string }
      | { url: string; filename: string };

    // ── ZIP: multiple files ───────────────────────────────────────────────────
    if ('urls' in body) {
      const { urls, filename } = body;
      if (!urls?.length || !filename) {
        return new Response('Missing urls or filename', { status: 400, headers: corsHeaders });
      }

      const zip = new JSZip();
      await Promise.all(
        urls.map(async (u, i) => {
          const r2Res = await fetch(u);
          if (!r2Res.ok) throw new Error(`R2 fetch failed for ${u}: ${r2Res.status}`);
          const buf = await r2Res.arrayBuffer();
          const ext = u.split('?')[0].split('.').pop() || 'jpg';
          zip.file(`${String(i + 1).padStart(2, '0')}.${ext}`, buf);
        }),
      );

      const zipBuf = await zip.generateAsync({ type: 'arraybuffer' });
      return new Response(zipBuf, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Content-Length': String(zipBuf.byteLength),
        },
      });
    }

    // ── Single file ──────────────────────────────────────────────────────────
    const { url, filename } = body;
    if (!url || !filename) {
      return new Response('Missing url or filename', { status: 400, headers: corsHeaders });
    }

    const r2Res = await fetch(url);
    if (!r2Res.ok) {
      return new Response(`R2 fetch failed: ${r2Res.status}`, { status: r2Res.status, headers: corsHeaders });
    }

    const contentType = r2Res.headers.get('content-type') || 'application/octet-stream';
    const buf = await r2Res.arrayBuffer();

    return new Response(buf, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(buf.byteLength),
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
