// 관리자용: DB(patterns)에서 참조하지 않는 R2 파일(고아 파일)을 찾고, 요청 시 삭제한다.
// 인증: Authorization: Bearer <서비스 롤 키>. 그 키로 관리자 API(auth.admin)가 실제로 호출될 때만 허용.
// body: { "dryRun": true }  → 개수·용량만 반환 (기본값)
//       { "dryRun": false } → 1시간 이상 지난 고아 파일 삭제
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch';

const MIN_AGE_MS = 60 * 60 * 1000; // 업로드 직후 아직 DB에 저장 안 된 파일 보호

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function isServiceKey(key: string): Promise<boolean> {
  if (!key) return false;
  try {
    const c = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
    const { error } = await c.auth.admin.listUsers({ page: 1, perPage: 1 });
    return !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!(await isServiceKey(token))) return json({ error: 'Unauthorized' }, 401);

  try {
    const { dryRun = true } = await req.json().catch(() => ({}));
    const accountId = Deno.env.get('R2_ACCOUNT_ID')!;
    const bucket = Deno.env.get('R2_BUCKET_NAME')!;
    const publicUrl = Deno.env.get('R2_PUBLIC_URL')!.replace(/\/$/, '');
    const aws = new AwsClient({
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      service: 's3',
      region: 'auto',
    });
    const base = `https://${bucket}.${accountId}.r2.cloudflarestorage.com`;

    // 1) R2 전체 목록
    const objects: { key: string; size: number; modified: number }[] = [];
    let cont: string | null = null;
    do {
      const u = new URL(base + '/');
      u.searchParams.set('list-type', '2');
      u.searchParams.set('max-keys', '1000');
      if (cont) u.searchParams.set('continuation-token', cont);
      const xml = await (await aws.fetch(u.toString())).text();
      for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const get = (t: string) => (m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) ?? [])[1] ?? '';
        const key = get('Key').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        objects.push({ key, size: Number(get('Size')), modified: Date.parse(get('LastModified')) });
      }
      cont = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? (xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/) ?? [])[1] ?? null
        : null;
    } while (cont);

    // 2) DB에서 참조 중인 키
    const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const referenced = new Set<string>();
    const patternIds = new Set<string>();
    const userIds = new Set<string>();
    let dbUrls = 0, unmatchedUrls = 0;
    const unmatchedKinds: string[] = [];
    const addUrl = (url?: string | null) => {
      if (!url) return;
      dbUrls++;
      if (url.startsWith(publicUrl + '/')) referenced.add(decodeURIComponent(url.slice(publicUrl.length + 1)));
      else {
        unmatchedUrls++; // 다른 주소 형식 → 이 상태에선 삭제 금지
        let kind = url.slice(0, 5);
        try { const u = new URL(url); kind = `${u.protocol}//${u.host.replace(/^[^.]+/, '*')} 경로끝:${u.pathname.split('/').slice(-1)[0].slice(-12)}`; } catch { /* data: 등 */ }
        unmatchedKinds.push(kind);
      }
    };
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('patterns')
        .select('id,user_id,file_url,thumbnail_url,extra_image_urls').range(from, from + 999);
      if (error) throw new Error('DB 조회 실패: ' + error.message);
      for (const row of data ?? []) {
        patternIds.add(row.id); userIds.add(row.user_id);
        addUrl(row.file_url); addUrl(row.thumbnail_url);
        for (const f of (row.extra_image_urls ?? []) as { url?: string; thumbnail_url?: string }[]) {
          addUrl(f?.url); addUrl(f?.thumbnail_url);
        }
      }
      if (!data || data.length < 1000) break;
    }

    const now = Date.now();
    const orphans = objects.filter((o) => !referenced.has(o.key));
    const deletable = orphans.filter((o) => now - o.modified > MIN_AGE_MS);
    const mb = (list: typeof objects) => Math.round(list.reduce((s, o) => s + o.size, 0) / 1048576 * 10) / 10;
    const summary = {
      totalFiles: objects.length, totalMB: mb(objects),
      referencedKeys: referenced.size,
      orphanFiles: orphans.length, orphanMB: mb(orphans),
      deletableFiles: deletable.length, deletableMB: mb(deletable),
      orphanUsers: new Set(orphans.map((o) => o.key.split('/')[0])).size,
      // 검증용 집계
      dbUrls, unmatchedUrls, unmatchedKinds,
      referencedButMissingInR2: [...referenced].filter((k) => !objects.some((o) => o.key === k)).length,
      orphansOfDeletedPatterns: orphans.filter((o) => !patternIds.has(o.key.split('/')[1])).length,
      orphansOfExistingPatterns: orphans.filter((o) => patternIds.has(o.key.split('/')[1])).length,
      orphansOfUsersWithNoPatterns: orphans.filter((o) => !userIds.has(o.key.split('/')[0])).length,
      orphanOldest: orphans.length ? new Date(Math.min(...orphans.map((o) => o.modified))).toISOString().slice(0, 10) : null,
      orphanNewest: orphans.length ? new Date(Math.max(...orphans.map((o) => o.modified))).toISOString().slice(0, 10) : null,
    };
    if (dryRun) return json({ dryRun: true, ...summary });
    // 앱 내장 샘플(sample-chart.svg 등)처럼 R2가 아닌 주소는 무시, R2처럼 보이는데 형식이 다른 주소가 있으면 중단
    const r2Host = new URL(publicUrl).host;
    if (unmatchedKinds.some((k) => k.includes('r2.dev') || k.includes(r2Host.replace(/^[^.]+/, '*')) || k.includes('cloudflarestorage'))) {
      return json({ error: 'DB에 다른 형식의 R2 주소가 있어 삭제 중단', ...summary }, 409);
    }
    if (summary.referencedButMissingInR2 > 0) return json({ error: '참조 중인 파일이 R2에 없음 - 점검 필요', ...summary }, 409);

    let deleted = 0;
    const failed: string[] = [];
    for (let i = 0; i < deletable.length; i += 20) {
      const batch = deletable.slice(i, i + 20);
      const res = await Promise.all(batch.map((o) =>
        aws.fetch(`${base}/${o.key.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' })));
      res.forEach((r, j) => (r.ok ? deleted++ : failed.push(batch[j].key)));
    }
    return json({ dryRun: false, ...summary, deleted, failed: failed.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
