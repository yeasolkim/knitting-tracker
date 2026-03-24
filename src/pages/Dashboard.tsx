import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import AuthGuard from '@/components/AuthGuard';
import PatternCard from '@/components/PatternCard';
import YarnLoader from '@/components/YarnLoader';
import { useLanguage, LanguageToggle } from '@/contexts/LanguageContext';

const STORAGE_LIMIT = 500 * 1024 * 1024; // 500 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StorageIndicator({ patterns }: { patterns: PatternWithProgress[] }) {
  const { t } = useLanguage();

  const sized = patterns.filter((p) => p.file_size != null);
  const totalBytes = sized.reduce((sum, p) => sum + (p.file_size ?? 0), 0);
  const pct = Math.min((totalBytes / STORAGE_LIMIT) * 100, 100);
  const hasPartial = sized.length < patterns.length && patterns.length > 0;

  const gaugeColor = pct > 80 ? '#b5541e' : pct > 60 ? '#c4872a' : '#7a9c72';

  return (
    <div className="flex flex-col items-center sm:items-end gap-1 mt-4 sm:mt-0">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#a08060]">
        {t('dashboard.storage')}
      </p>

      {/* Arc gauge */}
      <svg width="80" height="44" viewBox="0 0 80 44">
        {/* Track */}
        <path
          d="M 6,40 A 34,34 0 0,1 74,40"
          stroke="#d4b896" strokeWidth="6" fill="none" strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d="M 6,40 A 34,34 0 0,1 74,40"
          stroke={gaugeColor} strokeWidth="6" fill="none" strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${pct} 100`}
        />
        {/* Center text */}
        <text
          x="40" y="36"
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill={pct > 0 ? gaugeColor : '#c4a882'}
        >
          {pct > 0 ? `${Math.round(pct)}%` : '—'}
        </text>
      </svg>

      <p className="text-[10px] text-[#a08060] leading-none">
        <span style={{ color: gaugeColor }} className="font-semibold">{formatBytes(totalBytes)}</span>
        <span className="text-[#c4a882]"> / 500 MB</span>
      </p>
      {hasPartial && (
        <p className="text-[8px] text-[#c4a882]">* {t('dashboard.storage.partial')}</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <AuthGuard>
      {(user) => <DashboardPage userEmail={user.email} />}
    </AuthGuard>
  );
}

function DashboardPage({ userEmail }: { userEmail?: string }) {
  const navigate = useNavigate();
  const supabase = useMemo(() => createClient(), []);
  const [patterns, setPatterns] = useState<PatternWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPatterns = useCallback(async () => {
    const { data, error } = await supabase
      .from('patterns')
      .select('*, progress:pattern_progress(*)')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setPatterns(
        data.map((p: Record<string, unknown>) => ({
          ...p,
          progress: (p.progress as unknown[])?.[0] || null,
        })) as PatternWithProgress[]
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const handleDelete = useCallback(async (id: string) => {
    const pattern = patterns.find((p) => p.id === id);
    setPatterns((prev) => prev.filter((p) => p.id !== id));

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // R2 파일 삭제 (fire-and-forget, DB 삭제를 막지 않음)
    if (pattern) {
      const urls = [...new Set([pattern.file_url, pattern.thumbnail_url].filter(Boolean))] as string[];
      if (urls.length > 0) {
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-delete`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ urls }),
          },
        ).catch(() => {});
      }
    }

    const [, deleteResult] = await Promise.all([
      supabase.from('pattern_progress').delete().eq('pattern_id', id),
      supabase.from('patterns').delete().eq('id', id),
    ]);

    // If DB delete failed, restore the pattern in UI
    if (deleteResult.error) {
      fetchPatterns();
    }
  }, [supabase, patterns, fetchPatterns]);

  const { t } = useLanguage();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-[#f5edd6] border-b-2 border-[#d4b896] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
              <path d="M0,6 L4.5,0 L9,6 L13.5,0 L18,6" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M0,12 L4.5,6 L9,12 L13.5,6 L18,12" stroke="#b5541e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span className="font-bold text-[#3d2b1f] tracking-tight">{t('app.name')}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-[11px] text-[#a08060] hidden sm:block truncate max-w-[160px] tracking-wide">
              {userEmail}
            </span>
            <LanguageToggle />
            <button
              onClick={handleLogout}
              className="text-xs text-[#7a5c46] hover:text-[#3d2b1f] transition-colors min-h-[44px] flex items-center tracking-wide"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-7 sm:mb-9">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] tracking-tight">{t('dashboard.title')}</h1>
            {!loading && patterns.length > 0 && (
              <p className="text-xs text-[#a08060] mt-1 tracking-wide">{t('dashboard.count', { n: patterns.length })}</p>
            )}
          </div>
          <Link
            to="/patterns/new"
            className="inline-flex items-center gap-2 bg-[#b5541e] text-[#fdf6e8] px-4 py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318] min-h-[44px]"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('dashboard.addBtn')}
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <YarnLoader />
          </div>
        ) : patterns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-xl bg-[#fdf6e8] border-2 border-[#d4b896] flex items-center justify-center mb-5 shadow-[3px_3px_0_#d4b896]">
              <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                <path d="M0,9 L7,0 L14,9 L21,0 L28,9" stroke="#b5541e" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <path d="M0,18 L7,9 L14,18 L21,9 L28,18" stroke="#b5541e" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <p className="text-[#3d2b1f] font-semibold mb-1.5">{t('dashboard.empty.title')}</p>
            <p className="text-sm text-[#7a5c46] mb-7">{t('dashboard.empty.sub')}</p>
            <Link
              to="/patterns/new"
              className="text-sm font-semibold text-[#b5541e] hover:text-[#9a4318] tracking-wide transition-colors border-b-2 border-[#b5541e] pb-0.5"
            >
              {t('dashboard.empty.link')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>

      {!loading && (
        <div className="border-t-2 border-[#d4b896] bg-[#faf9f7]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col items-center gap-2">
            <StorageIndicator patterns={patterns} />
          </div>
        </div>
      )}

      <footer className="border-t-2 border-[#d4b896]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col items-center gap-1.5 text-center text-[11px] text-[#a08060]">
          <p>{t('footer.copyright')}</p>
          <p className="flex items-center gap-3">
            <a
              href="https://www.instagram.com/knitting_tang_official"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#b5541e] transition-colors underline underline-offset-2"
            >
              {t('footer.business')}
            </a>
            <span className="text-[#d4b896]">·</span>
            <a
              href="https://www.instagram.com/knitting_tang_official"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#b5541e] transition-colors underline underline-offset-2"
            >
              {t('footer.bug')}
            </a>
          </p>
          <p className="flex items-center gap-3 text-[10px] text-[#c4a882]">
            <Link
              to="/terms"
              className="hover:text-[#a08060] transition-colors underline underline-offset-2"
            >
              이용약관
            </Link>
            <span className="text-[#d4b896]">·</span>
            <Link
              to="/privacy"
              className="hover:text-[#a08060] transition-colors underline underline-offset-2 font-semibold"
            >
              개인정보처리방침
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
