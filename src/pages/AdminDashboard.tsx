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

interface Pattern {
  id: string;
  user_id: string;
  title: string;
  file_url: string | null;
  thumbnail_url: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'users' | 'patterns'>('users');
  const [filterAnonymous, setFilterAnonymous] = useState(false);
  const [filterAnonUsers, setFilterAnonUsers] = useState(false);
  const [sortByPatterns, setSortByPatterns] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [thumbnailTotalBytes, setThumbnailTotalBytes] = useState<number | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem('admin_auth') !== 'true') {
      navigate('/admin');
      return;
    }

    const client = createAdminClient();

    // listUsers는 최대 1000명씩 페이지네이션 필요
    const fetchAllUsers = async () => {
      const allUsers: AdminUser[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data?.users?.length) break;
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

      // file_size 없는 원본 + 모든 썸네일 → HEAD 요청으로 크기 측정
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
      console.error('Admin data fetch failed:', err);
      setLoading(false);
    });
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('admin_auth');
    navigate('/admin');
  };

  const deleteR2Files = async (urls: string[]) => {
    if (urls.length === 0) return true;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_KEY}` },
          body: JSON.stringify({ urls }),
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleDeletePattern = async (pattern: Pattern) => {
    if (!confirm(`"${pattern.title || '(제목 없음)'}" 도안을 삭제할까요?`)) return;

    const client = createAdminClient();

    const urls = [...new Set([pattern.file_url, pattern.thumbnail_url].filter(Boolean))] as string[];
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

    setDeleting(true);
    const client = createAdminClient();
    const ids = [...selectedUserIds];

    // 해당 유저의 도안 수집
    const userPatterns = patterns.filter(p => ids.includes(p.user_id));

    // R2 파일 삭제
    const urls = [...new Set(
      userPatterns.flatMap(p => [p.file_url, p.thumbnail_url]).filter(Boolean)
    )] as string[];
    await deleteR2Files(urls);

    // DB 삭제 (pattern_progress → patterns → user)
    const patternIds = userPatterns.map(p => p.id);
    if (patternIds.length > 0) {
      await client.from('pattern_progress').delete().in('pattern_id', patternIds);
      await client.from('patterns').delete().in('id', patternIds);
    }
    await Promise.all(ids.map(id => client.auth.admin.deleteUser(id)));

    setPatterns(prev => prev.filter(p => !ids.includes(p.user_id)));
    setUsers(prev => prev.filter(u => !ids.includes(u.id)));
    setSelectedUserIds(new Set());
    setDeleting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5edd6]">
        <div className="w-8 h-8 border-2 border-[#b07840] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

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
        {(() => {
          const fileBytes = patterns.reduce((sum, p) => sum + (p.file_size ?? 0), 0);
          // thumbnailTotalBytes에는 썸네일 + file_size null 원본 파일 크기가 포함됨
          const rawBytes = fileBytes + (thumbnailTotalBytes ?? 0);
          const totalBytes = rawBytes * 1.7;
          const formatSize = (bytes: number) => {
            if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
            if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
            if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
            return bytes + ' B';
          };
          return (
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
                  <p className="text-[10px] text-[#a08060] mt-1">
                    실측 {formatSize(rawBytes)} × 1.7
                  </p>
                )}
              </div>
            </div>
          );
        })()}

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

        {/* Users */}
        {tab === 'users' && (() => {
          const anonUsers = users.filter(u => u.is_anonymous);
          const baseUsers = filterAnonUsers ? anonUsers : users;
          const displayedUsers = sortByPatterns
            ? [...baseUsers].sort((a, b) => patterns.filter(p => p.user_id === b.id).length - patterns.filter(p => p.user_id === a.id).length)
            : baseUsers;
          const allAnonSelected = anonUsers.length > 0 && anonUsers.every(u => selectedUserIds.has(u.id));

          return (
            <>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <button
                  onClick={() => { setFilterAnonUsers(f => !f); setSelectedUserIds(new Set()); }}
                  className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                    filterAnonUsers
                      ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                      : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                  }`}
                >
                  비회원만 보기
                </button>
                <button
                  onClick={() => setSortByPatterns(f => !f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                    sortByPatterns
                      ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                      : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                  }`}
                >
                  도안 많은 순
                </button>
                {filterAnonUsers && (
                  <>
                    <button
                      onClick={() => {
                        if (allAnonSelected) setSelectedUserIds(new Set());
                        else setSelectedUserIds(new Set(anonUsers.map(u => u.id)));
                      }}
                      className="px-3 py-1 rounded-full text-xs font-bold border-2 bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] transition-all"
                    >
                      {allAnonSelected ? '전체 해제' : '전체 선택'}
                    </button>
                    {selectedUserIds.size > 0 && (
                      <button
                        onClick={handleDeleteSelectedUsers}
                        disabled={deleting}
                        className="px-3 py-1 rounded-full text-xs font-bold border-2 bg-red-500 text-white border-red-600 hover:bg-red-600 transition-all disabled:opacity-50"
                      >
                        {deleting ? '삭제 중…' : `${selectedUserIds.size}명 삭제`}
                      </button>
                    )}
                  </>
                )}
                <span className="text-[11px] text-[#a08060]">{displayedUsers.length}명</span>
              </div>
              <div className="flex flex-col gap-2">
                {displayedUsers.map(u => (
                  <div
                    key={u.id}
                    className={`bg-[#fdf6e8] border-2 rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
                      selectedUserIds.has(u.id) ? 'border-red-400' : 'border-[#b07840]'
                    }`}
                  >
                    {filterAnonUsers && (
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#3d2b1f] truncate">
                          {u.is_anonymous ? '비회원' : (u.email || '(이메일 없음)')}
                        </p>
                        {u.is_anonymous && (
                          <span className="shrink-0 text-[10px] font-bold text-[#a08060] border border-[#b07840] rounded px-1">비회원</span>
                        )}
                        {(() => {
                          const count = patterns.filter(p => p.user_id === u.id).length;
                          return count > 0 ? (
                            <span className="shrink-0 text-[10px] font-bold text-[#b5541e] border border-[#b5541e] rounded px-1">{count}개</span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-[11px] text-[#a08060] mt-0.5">
                        가입: {new Date(u.created_at).toLocaleDateString('ko-KR')}
                        {u.last_sign_in_at && (
                          <span className="ml-3">마지막 로그인: {new Date(u.last_sign_in_at).toLocaleDateString('ko-KR')}</span>
                        )}
                      </p>
                      {(() => {
                        const userPatterns = patterns.filter(p => p.user_id === u.id);
                        if (userPatterns.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {userPatterns.map(p => (
                              <span key={p.id} className="text-[10px] text-[#7a5c46] bg-[#f5edd6] border border-[#c4a882] rounded px-1.5 py-0.5 truncate max-w-[140px]">
                                {p.title || '(제목 없음)'}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <span className="text-[10px] text-[#a08060] font-mono shrink-0">{u.id.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Patterns */}
        {tab === 'patterns' && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setFilterAnonymous(f => !f)}
                className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                  filterAnonymous
                    ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
                    : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840]'
                }`}
              >
                비회원 도안만 보기
              </button>
              <span className="text-[11px] text-[#a08060]">
                {filterAnonymous
                  ? `${patterns.filter(p => users.find(u => u.id === p.user_id)?.is_anonymous).length}개`
                  : `${patterns.length}개`}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {patterns
                .filter(p => !filterAnonymous || users.find(u => u.id === p.user_id)?.is_anonymous)
                .map(p => {
                  const owner = users.find(u => u.id === p.user_id);
                  return (
                    <div key={p.id} className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[#3d2b1f] truncate">{p.title || '(제목 없음)'}</p>
                            {owner?.is_anonymous && (
                              <span className="shrink-0 text-[10px] font-bold text-[#a08060] border border-[#b07840] rounded px-1">비회원</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#a08060] mt-0.5">
                            {owner?.email ?? p.user_id.slice(0, 8) + '…'}
                            <span className="mx-1.5">·</span>
                            {new Date(p.created_at).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
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
                            onClick={() => handleDeletePattern(p)}
                            className="text-xs font-bold text-[#fdf6e8] bg-red-500 border-2 border-red-600 rounded-lg px-3 py-1.5 hover:bg-red-600 transition-all"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                      {p.thumbnail_url && (
                        <img
                          src={p.thumbnail_url}
                          alt={p.title}
                          className="mt-2 h-16 rounded-lg object-cover border border-[#b07840]"
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
