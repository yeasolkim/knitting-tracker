import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress, SubPattern } from '@/lib/types';
import AuthGuard from '@/components/AuthGuard';
import PatternCard from '@/components/PatternCard';
import YarnLoader from '@/components/YarnLoader';
import { useLanguage, LanguageToggle } from '@/contexts/LanguageContext';
import { cachePatterns, getCachedPatterns } from '@/lib/offlineQueue';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

const PATTERN_LIMIT = 20;

type TypeFilter = 'all' | 'knitting' | 'crochet';
type StatusFilter = 'all' | 'inProgress' | 'completed';
type SortKey = 'updated' | 'created' | 'title' | 'progress';

function getProgress(pattern: PatternWithProgress): number {
  const subs = (pattern.progress?.sub_patterns as SubPattern[]) || [];
  const total = subs.length > 0
    ? subs.reduce((s, p) => s + (p.total_rows || 0), 0)
    : pattern.total_rows;
  const current = subs.length > 0
    ? subs.reduce((s, p) => s + (p.current_row || 0), 0)
    : pattern.progress?.current_row || 0;
  return total > 0 ? (current / total) * 100 : 0;
}

export default function Dashboard() {
  return (
    <AuthGuard>
      {(user, authLoading) => (
        <DashboardPage
          userEmail={user.email}
          isAnonymous={user.is_anonymous ?? false}
          authLoading={authLoading}
        />
      )}
    </AuthGuard>
  );
}

function DashboardPage({ userEmail, isAnonymous, authLoading }: { userEmail?: string; isAnonymous: boolean; authLoading: boolean }) {
  const navigate = useNavigate();
  const supabase = useMemo(() => createClient(), []);
  const [patterns, setPatterns] = useState<PatternWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const isOnline = useOnlineStatus();

  // Filter & sort state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');

  const { t } = useLanguage();

  const showToast = useCallback((msg: string, ms = 3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  }, []);

  const fetchPatterns = useCallback(async () => {
    const { data, error } = await supabase
      .from('patterns')
      .select('*, progress:pattern_progress(*)')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      const mapped = data.map((p: Record<string, unknown>) => ({
        ...p,
        progress: (p.progress as unknown[])?.[0] || null,
      })) as PatternWithProgress[];
      setPatterns(mapped);
      cachePatterns(mapped); // Save to localStorage for offline use
      setIsFromCache(false);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!navigator.onLine) {
      // Offline: load from localStorage cache
      const cached = getCachedPatterns();
      if (cached) {
        setPatterns(cached);
        setIsFromCache(true);
        setLoading(false);
        return;
      }
    }
    fetchPatterns();
  }, [fetchPatterns]);

  // When back online, refresh from server
  useEffect(() => {
    if (isOnline && isFromCache) {
      setIsFromCache(false);
      fetchPatterns();
    }
  }, [isOnline, isFromCache, fetchPatterns]);

  // Derived: filtered + sorted patterns
  const filteredPatterns = useMemo(() => {
    let result = [...patterns];

    if (typeFilter !== 'all') result = result.filter(p => p.type === typeFilter);

    if (statusFilter === 'completed') result = result.filter(p => getProgress(p) >= 100);
    else if (statusFilter === 'inProgress') result = result.filter(p => getProgress(p) < 100);

    result.sort((a, b) => {
      if (sortBy === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'progress') return getProgress(b) - getProgress(a);
      return 0;
    });

    return result;
  }, [patterns, typeFilter, statusFilter, sortBy]);

  const isFiltered = typeFilter !== 'all' || statusFilter !== 'all' || sortBy !== 'updated';

  const handleDelete = useCallback(async (id: string) => {
    if (!navigator.onLine) {
      showToast(t('offline.actionBlocked'));
      return;
    }
    const backup = patterns.find((p) => p.id === id);
    setPatterns((prev) => prev.filter((p) => p.id !== id));

    if (backup) {
      const extraUrls = (backup.extra_image_urls ?? []).flatMap((f) =>
        [f.url, f.thumbnail_url].filter(Boolean)
      ) as string[];
      const urls = [...new Set([backup.file_url, backup.thumbnail_url, ...extraUrls].filter(Boolean))] as string[];
      if (urls.length > 0) {
        supabase.functions.invoke('r2-delete', { body: { urls } }).catch(() => {});
      }
    }

    const [, deleteResult] = await Promise.all([
      supabase.from('pattern_progress').delete().eq('pattern_id', id),
      supabase.from('patterns').delete().eq('id', id),
    ]);

    if (deleteResult.error) {
      if (backup) setPatterns((prev) => [...prev, backup]);
      showToast(t('dashboard.deleteError'));
    }
  }, [supabase, patterns, showToast, t]);

  const handleDuplicate = useCallback(async (id: string) => {
    if (duplicatingId) return;
    if (!navigator.onLine) {
      showToast(t('offline.actionBlocked'));
      return;
    }
    const pattern = patterns.find(p => p.id === id);
    if (!pattern) return;
    setDuplicatingId(id);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from('patterns').insert({
      user_id: user.id,
      title: t('dashboard.duplicatePrefix') + pattern.title,
      type: pattern.type,
      file_url: pattern.file_url,
      file_type: pattern.file_type,
      thumbnail_url: pattern.thumbnail_url,
      extra_image_urls: pattern.extra_image_urls ?? [],
      total_rows: pattern.total_rows,
      yarn: pattern.yarn,
      needle: pattern.needle,
      file_size: pattern.file_size,
    }).select().single();

    if (error || !data) {
      showToast(t('dashboard.duplicateError'));
      setDuplicatingId(null);
      return;
    }

    try {
      await fetchPatterns();
      navigate(`/patterns/${data.id}/edit`);
    } finally {
      setDuplicatingId(null);
    }
  }, [supabase, patterns, t, navigate, fetchPatterns, showToast, duplicatingId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleLinkGoogle = async () => {
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  const chipClass = (active: boolean) =>
    `text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors min-h-[36px] ${
      active
        ? 'bg-[#b5541e] text-[#fdf6e8] border-[#9a4318]'
        : 'bg-[#fdf6e8] text-[#7a5c46] border-[#b07840] hover:border-[#b5541e] hover:text-[#b5541e]'
    }`;

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <nav className="bg-[#f5edd6] border-b-2 border-[#b07840] sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg width="18" height="12" viewBox="0 0 18 12" fill="none" className="shrink-0">
                <path d="M0,6 L4.5,0 L9,6 L13.5,0 L18,6" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,12 L4.5,6 L9,12 L13.5,6 L18,12" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span className="font-bold text-[#3d2b1f] tracking-tight text-sm">{t('app.name')}</span>
            </div>
          </div>
        </nav>
        <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#fdf6e8] rounded-xl border-2 border-[#b07840] overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-[#f0e6d3]" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-[#e8dcc8] rounded w-3/4" />
                  <div className="h-2 bg-[#e8dcc8] rounded w-1/2" />
                  <div className="h-1.5 bg-[#e8dcc8] rounded-full mt-3" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="bg-[#f5edd6] border-b-2 border-[#b07840] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0 shrink">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="none" className="shrink-0">
              <path d="M0,6 L4.5,0 L9,6 L13.5,0 L18,6" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M0,12 L4.5,6 L9,12 L13.5,6 L18,12" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="font-bold text-[#3d2b1f] tracking-tight text-sm whitespace-nowrap truncate">{t('app.name')}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {isAnonymous ? (
              <button
                onClick={handleLinkGoogle}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#b5541e] border-2 border-[#b5541e] rounded-lg px-2.5 py-1.5 hover:bg-[#b5541e] hover:text-[#fdf6e8] transition-all min-h-[36px]"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="currentColor"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
                </svg>
                {t('dashboard.linkGoogle')}
              </button>
            ) : (
              <span className="text-[11px] text-[#a08060] hidden sm:block truncate max-w-[160px] tracking-wide">
                {userEmail}
              </span>
            )}
            <LanguageToggle />
            {showLogoutConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#7a5c46] hidden sm:inline tracking-wide">{t('nav.logoutConfirm')}</span>
                <button
                  onClick={handleLogout}
                  className="text-xs font-bold text-[#fdf6e8] bg-[#b5541e] border-2 border-[#9a4318] rounded-lg px-2.5 py-1 min-h-[36px] hover:bg-[#9a4318] transition-colors tracking-wide"
                >
                  {t('nav.logout')}
                </button>
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="text-xs text-[#a08060] hover:text-[#3d2b1f] transition-colors min-h-[36px] px-1 tracking-wide"
                >
                  {t('card.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="text-xs text-[#7a5c46] hover:text-[#3d2b1f] transition-colors min-h-[44px] flex items-center tracking-wide focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b5541e] rounded"
              >
                {t('nav.logout')}
              </button>
            )}
          </div>
        </div>
      </nav>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!toast}
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#3d2b1f] text-[#fdf6e8] text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-[80vw] text-center pointer-events-none transition-opacity duration-200 ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast ?? ''}
      </div>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {isFromCache && (
          <p className="text-[11px] text-[#b07840] text-center mb-3 bg-[#fdf6e8] border-2 border-[#d4b896] rounded-lg px-3 py-2">
            {t('offline.cacheNote')}
          </p>
        )}
        {isAnonymous && (
          <p className="text-[11px] text-[#a08060] text-center mb-4">
            {t('dashboard.anonWarning')}
          </p>
        )}
        {patterns.length === 0 ? (
          /* 빈 상태 */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] tracking-tight mb-8">{t('dashboard.title')}</h1>
            <div className="w-16 h-16 rounded-xl bg-[#fdf6e8] border-2 border-[#b07840] flex items-center justify-center mb-5 shadow-[3px_3px_0_#b07840]">
              <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b5541e" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b5541e" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <p className="text-[#3d2b1f] font-semibold mb-1.5">{t('dashboard.empty.title')}</p>
            <p className="text-sm text-[#7a5c46] mb-8">{t('dashboard.empty.sub')}</p>
            <button
              onClick={() => navigate('/patterns/new')}
              className="inline-flex items-center gap-2 bg-[#b5541e] text-[#fdf6e8] px-5 py-3 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318] min-h-[44px]"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('dashboard.addBtn')}
            </button>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-5 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] tracking-tight">{t('dashboard.title')}</h1>
                <p className="text-xs text-[#a08060] mt-1 tracking-wide">
                  {filteredPatterns.length === patterns.length
                    ? t('dashboard.count', { n: patterns.length })
                    : t('dashboard.count.filtered', { shown: filteredPatterns.length, total: patterns.length })}
                </p>
              </div>
              <button
                onClick={() => {
                  if (patterns.length >= PATTERN_LIMIT) {
                    showToast(t('dashboard.patternLimitAlert'), 4000);
                    return;
                  }
                  navigate('/patterns/new');
                }}
                aria-disabled={patterns.length >= PATTERN_LIMIT}
                className={`inline-flex items-center gap-2 bg-[#b5541e] text-[#fdf6e8] px-4 py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318] min-h-[44px] ${patterns.length >= PATTERN_LIMIT ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboard.addBtn')}
              </button>
            </div>

            <p className="text-[11px] text-[#a08060] text-center mb-3 sm:hidden">
              {t('dashboard.mobileWarning')}
            </p>

            {/* 필터 & 정렬 바 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-5 sm:mb-6">
              {/* 종류 필터 */}
              <div className="flex items-center gap-1">
                {(['all', 'knitting', 'crochet'] as TypeFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setTypeFilter(f)}
                    className={chipClass(typeFilter === f)}
                  >
                    {f === 'all' ? t('dashboard.filter.all') : t(`card.type.${f}`)}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-[#d4b896] hidden sm:block" />
              {/* 상태 필터 */}
              <div className="flex items-center gap-1">
                {(['all', 'inProgress', 'completed'] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={chipClass(statusFilter === f)}
                  >
                    {t(`dashboard.filter.${f}`)}
                  </button>
                ))}
              </div>
              {/* 정렬 */}
              <div className="ml-auto relative">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortKey)}
                  className="appearance-none text-[10px] font-semibold text-[#7a5c46] border-2 border-[#b07840] rounded-full pl-2.5 pr-6 py-1.5 bg-[#fdf6e8] cursor-pointer focus:outline-none focus:border-[#b5541e] focus:text-[#b5541e] min-h-[36px] transition-colors hover:border-[#b5541e]"
                >
                  <option value="updated">{t('dashboard.sort.updated')}</option>
                  <option value="created">{t('dashboard.sort.created')}</option>
                  <option value="title">{t('dashboard.sort.title')}</option>
                  <option value="progress">{t('dashboard.sort.progress')}</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-[#b07840]"
                  fill="none" viewBox="0 0 10 10"
                >
                  <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* 그리드 or 필터 결과 없음 */}
            {filteredPatterns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm font-semibold text-[#7a5c46] mb-3">{t('dashboard.noResult')}</p>
                {isFiltered && (
                  <button
                    onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setSortBy('updated'); }}
                    className="text-xs text-[#b5541e] hover:underline font-semibold"
                  >
                    {t('dashboard.noResult.reset')}
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
                {filteredPatterns.map((pattern) => (
                  <PatternCard
                    key={pattern.id}
                    pattern={pattern}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    duplicating={duplicatingId === pattern.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t-2 border-[#b07840]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col items-center gap-1.5 text-center text-[11px] text-[#a08060]">
          <p>{t('footer.copyright')}</p>
          <p>
            <a
              href="https://www.instagram.com/knitting_in_the_sauna"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#b5541e] transition-colors underline underline-offset-2"
            >
              {t('footer.bug')}
            </a>
          </p>
          <p className="flex items-center gap-3 text-[10px] text-[#c4a882]">
            <Link to="/terms" className="hover:text-[#a08060] transition-colors underline underline-offset-2">
              {t('footer.terms')}
            </Link>
            <span className="text-[#b07840]">·</span>
            <Link to="/privacy" className="hover:text-[#a08060] transition-colors underline underline-offset-2 font-semibold">
              {t('footer.privacy')}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
