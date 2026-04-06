import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAdminClient } from '@/lib/supabase/adminClient';

interface AdminUser {
  id: string;
  email: string;
  is_anonymous: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

interface ExtraFile {
  url: string;
  thumbnail_url: string | null;
}

interface Pattern {
  id: string;
  user_id: string;
  title: string;
  type: string;
  file_url: string | null;
  file_type: string | null;
  thumbnail_url: string | null;
  extra_image_urls: ExtraFile[] | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' });
}

// ─── Pattern mini-card (used in both tabs) ──────────────────────────────────
function PatternCard({
  pattern,
  onDelete,
}: {
  pattern: Pattern;
  onDelete: (p: Pattern) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const extraCount = (pattern.extra_image_urls ?? []).length;

  const handleDelete = async () => {
    if (!confirm(`"${pattern.title || '(제목 없음)'}" 도안을 삭제할까요?`)) return;
    setDeleting(true);
    await onDelete(pattern);
    setDeleting(false);
  };

  return (
    <div className="bg-[#f5edd6] rounded-xl border-2 border-[#c4a882] overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-[#e8dcc8] flex-shrink-0">
        {pattern.thumbnail_url ? (
          <img
            src={pattern.thumbnail_url}
            alt={pattern.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
              <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
        )}
        {/* Extra image count badge */}
        {extraCount > 0 && (
          <div className="absolute bottom-1 right-1 bg-[#3d2b1f]/70 text-[#fdf6e8] text-[9px] font-bold rounded px-1 py-0.5">
            +{extraCount}장
          </div>
        )}
        {/* Type badge */}
        <div className="absolute top-1 left-1 bg-[#3d2b1f]/60 text-[#fdf6e8] text-[9px] font-bold rounded px-1 py-0.5">
          {pattern.type === 'crochet' ? '코바늘' : '대바늘'}
        </div>
      </div>

      {/* Info */}
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-semibold text-[#3d2b1f] leading-tight line-clamp-2">
          {pattern.title || '(제목 없음)'}
        </p>
        <p className="text-[10px] text-[#a08060]">{formatDate(pattern.created_at)}</p>

        {/* Action buttons */}
        <div className="flex gap-1 mt-auto pt-1">
          {pattern.file_url && (
            <a
              href={pattern.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-[10px] font-bold text-[#b5541e] border-2 border-[#b5541e] rounded-lg py-1 hover:bg-[#b5541e] hover:text-[#fdf6e8] transition-colors"
            >
              열기
            </a>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 text-[10px] font-bold text-white bg-red-400 border-2 border-red-500 rounded-lg py-1 hover:bg-red-500 transition-colors disabled:opacity-50"
          >
            {deleting ? '…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tab, setTab] = useState<'users' | 'patterns'>('users');

  // Users tab state
  const [filterAnonUsers, setFilterAnonUsers] = useState(false);
  const [sortByPatterns, setSortByPatterns] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());
  const [deletingUsers, setDeletingUsers] = useState(false);

  // Patterns tab state
  const [filterAnonymous, setFilterAnonymous] = useState(false);
  const [patternSearch, setPatternSearch] = useState('');

  const [thumbnailTotalBytes, setThumbnailTotalBytes] = useState<number | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem('admin_auth') !== 'true') {
      navigate('/admin');
      return;
    }

    const client = createAdminClient();

    const fetchAllUsers = async () => {
      const allUsers: AdminUser[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`listUsers failed: ${error.message} (status: ${error.status})`);
        if (!data?.users?.length) break;
        allUsers.push(...(data.users as AdminUser[]));
        if (data.users.length < 1000) break;
        page++;
      }
      return allUsers;
    };

    Promise.all([
      fetchAllUsers(),
      client.from('patterns').select('*').order('created_at', { ascending: false }),
    ]).then(([allUsers, patternsRes]) => {
      setUsers(allUsers);
      const ps = (patternsRes.data ?? []) as Pattern[];
      if (patternsRes.data) setPatterns(ps);
      setLoading(false);

      const headTargets = ps.flatMap(p => {
        const targets: string[] = [];
        if (!p.file_size && p.file_url) targets.push(p.file_url);
        if (p.thumbnail_url) targets.push(p.thumbnail_url);
        return targets;
      }).filter(Boolean) as string[];

      Promise.all(
        headTargets.map(url =>
          fetch(url, { method: 'HEAD' })
            .then(r => parseInt(r.headers.get('content-length') ?? '0', 10))
            .catch(() => 0)
        )
      ).then(sizes => setThumbnailTotalBytes(sizes.reduce((a, b) => a + b, 0)));
    }).catch((err) => {
      setFetchError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    navigate('/admin');
  };

  const deleteR2Files = async (urls: string[]) => {
    if (urls.length === 0) return;
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_KEY}` },
          body: JSON.stringify({ urls }),
        },
      );
    } catch { /* ignore */ }
  };

  const handleDeletePattern = async (pattern: Pattern) => {
    const client = createAdminClient();

    const extraUrls = (pattern.extra_image_urls ?? []).flatMap(f =>
      [f.url, f.thumbnail_url].filter(Boolean)
    ) as string[];
    const urls = [...new Set([pattern.file_url, pattern.thumbnail_url, ...extraUrls].filter(Boolean))] as string[];
    await deleteR2Files(urls);

    await Promise.all([
      client.from('pattern_progress').delete().eq('pattern_id', pattern.id),
      client.from('patterns').delete().eq('id', pattern.id),
    ]);

    setPatterns(prev => prev.filter(p => p.id !== pattern.id));
  };

  const handleDeleteSelectedUsers = async () => {
    if (selectedUserIds.size === 0) return;
    if (!confirm(`비회원 ${selectedUserIds.size}명과 해당 도안을 모두 삭제할까요?`)) return;

    setDeletingUsers(true);
    const client = createAdminClient();
    const ids = [...selectedUserIds];

    const userPatterns = patterns.filter(p => ids.includes(p.user_id));
    const extraUrls = userPatterns.flatMap(p =>
      (p.extra_image_urls ?? []).flatMap(f => [f.url, f.thumbnail_url].filter(Boolean))
    ) as string[];
    const urls = [...new Set(
      userPatterns.flatMap(p => [p.file_url, p.thumbnail_url]).filter(Boolean).concat(extraUrls)
    )] as string[];
    await deleteR2Files(urls);

    const patternIds = userPatterns.map(p => p.id);
    if (patternIds.length > 0) {
      await client.from('pattern_progress').delete().in('pattern_id', patternIds);
      await client.from('patterns').delete().in('id', patternIds);
    }
    await Promise.all(ids.map(id => client.auth.admin.deleteUser(id)));

    setPatterns(prev => prev.filter(p => !ids.includes(p.user_id)));
    setUsers(prev => prev.filter(u => !ids.includes(u.id)));
    setSelectedUserIds(new Set());
    setExpandedUserIds(new Set());
    setDeletingUsers(false);
  };

  const toggleExpand = (userId: string) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5edd6]">
        <div className="w-8 h-8 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5edd6] p-6">
        <div className="bg-[#fdf6e8] border-2 border-red-400 rounded-xl p-6 max-w-lg w-full">
          <p className="text-sm font-bold text-red-600 mb-2">데이터 로드 실패</p>
          <pre className="text-xs text-red-500 whitespace-pre-wrap break-all bg-red-50 rounded p-3">{fetchError}</pre>
          <button onClick={() => window.location.reload()} className="mt-4 text-xs text-[#b5541e] underline">새로고침</button>
        </div>
      </div>
    );
  }

  const fileBytes = patterns.reduce((sum, p) => sum + (p.file_size ?? 0), 0);
  const rawBytes = fileBytes + (thumbnailTotalBytes ?? 0);
  const totalBytes = rawBytes * 1.7;

  return (
    <div className="min-h-screen bg-[#f5edd6]">
      {/* Nav */}
      <nav className="bg-[#f5edd6] border-b-2 border-[#b07840] px-5 h-14 flex items-center justify-between sticky top-0 z-10">
        <div>
          <span className="font-bold text-[#3d2b1f] tracking-tight">어드민</span>
          <span className="text-xs text-[#a08060] ml-2">니팅인더사우나</span>
        </div>
        <button onClick={handleLogout} className="text-xs text-[#7a5c46] hover:text-[#3d2b1f] transition-colors">
          로그아웃
        </button>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl p-4 shadow-[2px_2px_0_#b07840]">
            <p className="text-xs text-[#a08060] mb-1">총 회원</p>
            <p className="text-3xl font-bold text-[#3d2b1f]">{users.length}</p>
            <p className="text-[10px] text-[#a08060] mt-1">비회원 {users.filter(u => u.is_anonymous).length}명</p>
          </div>
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl p-4 shadow-[2px_2px_0_#b07840]">
            <p className="text-xs text-[#a08060] mb-1">총 도안</p>
            <p className="text-3xl font-bold text-[#3d2b1f]">{patterns.length}</p>
          </div>
          <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl p-4 shadow-[2px_2px_0_#b07840]">
            <p className="text-xs text-[#a08060] mb-1">총 용량</p>
            <p className="text-2xl font-bold text-[#3d2b1f]">
              {thumbnailTotalBytes === null ? '측정 중…' : formatSize(totalBytes)}
            </p>
            {thumbnailTotalBytes !== null && (
              <p className="text-[10px] text-[#a08060] mt-1">실측 {formatSize(rawBytes)} × 1.7</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['users', 'patterns'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                tab === t
                  ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                  : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] hover:border-[#b5541e]'
              }`}
            >
              {t === 'users' ? `회원 (${users.length})` : `도안 (${patterns.length})`}
            </button>
          ))}
        </div>

        {/* ── Users tab ────────────────────────────────────────────────── */}
        {tab === 'users' && (() => {
          const anonUsers = users.filter(u => u.is_anonymous);
          const baseUsers = filterAnonUsers ? anonUsers : users;
          const displayedUsers = sortByPatterns
            ? [...baseUsers].sort((a, b) =>
                patterns.filter(p => p.user_id === b.id).length -
                patterns.filter(p => p.user_id === a.id).length
              )
            : baseUsers;
          const allAnonSelected = anonUsers.length > 0 && anonUsers.every(u => selectedUserIds.has(u.id));

          return (
            <>
              {/* Filters */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button
                  onClick={() => { setFilterAnonUsers(f => !f); setSelectedUserIds(new Set()); }}
                  className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                    filterAnonUsers ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]' : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                  }`}
                >
                  비회원만 보기
                </button>
                <button
                  onClick={() => setSortByPatterns(f => !f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                    sortByPatterns ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]' : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                  }`}
                >
                  도안 많은 순
                </button>
                {filterAnonUsers && (
                  <>
                    <button
                      onClick={() => setSelectedUserIds(allAnonSelected ? new Set() : new Set(anonUsers.map(u => u.id)))}
                      className="px-3 py-1 rounded-full text-xs font-bold border-2 bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]"
                    >
                      {allAnonSelected ? '전체 해제' : '전체 선택'}
                    </button>
                    {selectedUserIds.size > 0 && (
                      <button
                        onClick={handleDeleteSelectedUsers}
                        disabled={deletingUsers}
                        className="px-3 py-1 rounded-full text-xs font-bold border-2 bg-red-500 text-white border-red-600 hover:bg-red-600 transition-all disabled:opacity-50"
                      >
                        {deletingUsers ? '삭제 중…' : `${selectedUserIds.size}명 삭제`}
                      </button>
                    )}
                  </>
                )}
                <span className="text-[11px] text-[#a08060]">{displayedUsers.length}명</span>
              </div>

              {/* User list */}
              <div className="flex flex-col gap-2">
                {displayedUsers.map(u => {
                  const userPatterns = patterns.filter(p => p.user_id === u.id);
                  const isExpanded = expandedUserIds.has(u.id);

                  return (
                    <div
                      key={u.id}
                      className={`bg-[#fdf6e8] border-2 rounded-xl overflow-hidden transition-colors ${
                        selectedUserIds.has(u.id) ? 'border-red-400' : 'border-[#b07840]'
                      }`}
                    >
                      {/* User row — click to expand */}
                      <div
                        className="px-4 py-3 flex items-center gap-3 cursor-pointer select-none hover:bg-[#f5edd6] transition-colors"
                        onClick={() => userPatterns.length > 0 && toggleExpand(u.id)}
                      >
                        {filterAnonUsers && (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              setSelectedUserIds(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(u.id) : next.delete(u.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 shrink-0 accent-red-500"
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[#3d2b1f] truncate">
                              {u.is_anonymous ? '비회원' : (u.email || '(이메일 없음)')}
                            </p>
                            {u.is_anonymous && (
                              <span className="text-[10px] font-bold text-[#a08060] border border-[#b07840] rounded px-1">비회원</span>
                            )}
                            {userPatterns.length > 0 && (
                              <span className="text-[10px] font-bold text-[#b5541e] border border-[#b5541e] rounded px-1">
                                도안 {userPatterns.length}개
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#a08060] mt-0.5">
                            가입: {formatDate(u.created_at)}
                            {u.last_sign_in_at && (
                              <span className="ml-3">마지막 로그인: {formatDate(u.last_sign_in_at)}</span>
                            )}
                            <span className="ml-3 font-mono">{u.id.slice(0, 8)}…</span>
                          </p>
                        </div>

                        {/* Expand chevron */}
                        {userPatterns.length > 0 && (
                          <svg
                            className={`w-4 h-4 text-[#a08060] shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </div>

                      {/* Expanded: pattern grid */}
                      {isExpanded && userPatterns.length > 0 && (
                        <div className="px-4 pb-4 border-t border-[#e8dcc8]">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-3">
                            {userPatterns.map(p => (
                              <PatternCard
                                key={p.id}
                                pattern={p}
                                onDelete={handleDeletePattern}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── Patterns tab ─────────────────────────────────────────────── */}
        {tab === 'patterns' && (() => {
          const filtered = patterns
            .filter(p => !filterAnonymous || users.find(u => u.id === p.user_id)?.is_anonymous)
            .filter(p => {
              if (!patternSearch) return true;
              const q = patternSearch.toLowerCase();
              const owner = users.find(u => u.id === p.user_id);
              return (
                (p.title ?? '').toLowerCase().includes(q) ||
                (owner?.email ?? '').toLowerCase().includes(q)
              );
            });

          return (
            <>
              {/* Filters + search */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button
                  onClick={() => setFilterAnonymous(f => !f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                    filterAnonymous ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]' : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                  }`}
                >
                  비회원 도안만
                </button>
                <input
                  type="text"
                  placeholder="도안명 / 이메일 검색"
                  value={patternSearch}
                  onChange={e => setPatternSearch(e.target.value)}
                  className="border-2 border-[#b07840] bg-[#fdf6e8] rounded-lg px-3 py-1 text-xs text-[#3d2b1f] focus:outline-none focus:border-[#b5541e] placeholder:text-[#c4a882] w-44"
                />
                <span className="text-[11px] text-[#a08060]">{filtered.length}개</span>
              </div>

              {/* Pattern list */}
              <div className="flex flex-col gap-2">
                {filtered.map(p => {
                  const owner = users.find(u => u.id === p.user_id);
                  const extraCount = (p.extra_image_urls ?? []).length;
                  return (
                    <div key={p.id} className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl px-4 py-3">
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border border-[#c4a882] bg-[#e8dcc8]">
                          {p.thumbnail_url ? (
                            <img src={p.thumbnail_url} alt={p.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg width="20" height="14" viewBox="0 0 28 18" fill="none">
                                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b07840" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-[#3d2b1f] truncate">
                              {p.title || '(제목 없음)'}
                            </p>
                            <span className="text-[10px] font-bold text-[#a08060] border border-[#c4a882] rounded px-1">
                              {p.type === 'crochet' ? '코바늘' : '대바늘'}
                            </span>
                            {owner?.is_anonymous && (
                              <span className="text-[10px] font-bold text-[#a08060] border border-[#b07840] rounded px-1">비회원</span>
                            )}
                            {extraCount > 0 && (
                              <span className="text-[10px] font-bold text-[#7a5c46] border border-[#c4a882] rounded px-1">
                                이미지 {extraCount + 1}장
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#a08060] mt-0.5">
                            {owner?.email ?? p.user_id.slice(0, 8) + '…'}
                            <span className="mx-1.5">·</span>
                            {formatDate(p.created_at)}
                            {p.file_size && (
                              <span className="ml-2">{formatSize(p.file_size)}</span>
                            )}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {p.file_url && (
                            <a
                              href={p.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-[#b5541e] border-2 border-[#b5541e] rounded-lg px-3 py-1.5 hover:bg-[#b5541e] hover:text-[#fdf6e8] transition-all"
                            >
                              열기
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm(`"${p.title || '(제목 없음)'}" 도안을 삭제할까요?`)) return;
                              await handleDeletePattern(p);
                            }}
                            className="text-xs font-bold text-white bg-red-400 border-2 border-red-500 rounded-lg px-3 py-1.5 hover:bg-red-500 transition-all"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-sm text-[#a08060] text-center py-8">검색 결과가 없어요</p>
                )}
              </div>
            </>
          );
        })()}
      </main>
    </div>
  );
}
