import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';
import type { PatternWithProgress } from '@/lib/types';
import AuthGuard from '@/components/AuthGuard';
import PatternCard from '@/components/PatternCard';
import YarnLoader from '@/components/YarnLoader';
import { useLanguage, LanguageToggle } from '@/contexts/LanguageContext';

const PATTERN_LIMIT = 8;

export default function Dashboard() {
  return (
    <AuthGuard>
      {(user) => <DashboardPage userEmail={user.email} isAnonymous={user.is_anonymous ?? false} />}
    </AuthGuard>
  );
}

function DashboardPage({ userEmail, isAnonymous }: { userEmail?: string; isAnonymous: boolean }) {
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

  const handleLinkGoogle = async () => {
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5edd6]">
        <YarnLoader />
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
                Google 연동
              </button>
            ) : (
              <span className="text-[11px] text-[#a08060] hidden sm:block truncate max-w-[160px] tracking-wide">
                {userEmail}
              </span>
            )}
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

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {patterns.length === 0 ? (
          /* 빈 상태: 전체 중앙 정렬 */
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
          {/* 도안 있을 때: 기존 헤더 + 그리드 */}
          <div className="flex items-center justify-between mb-7 sm:mb-9">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#3d2b1f] tracking-tight">{t('dashboard.title')}</h1>
              <p className="text-xs text-[#a08060] mt-1 tracking-wide">{t('dashboard.count', { n: patterns.length })}</p>
            </div>
            <button
              onClick={() => {
                if (patterns.length >= PATTERN_LIMIT) {
                  alert('😭 베타 서비스 기간에는 최대 도안 파일 개수를 제한하고 있어요.\n\n문어도 다리가 8갠데, 사람인 우리가 이렇게 많이 동시에 뜨개질 할 수 있나요?\n\n최대 도안 파일은 8개까지예요.');
                  return;
                }
                navigate('/patterns/new');
              }}
              className="inline-flex items-center gap-2 bg-[#b5541e] text-[#fdf6e8] px-4 py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase hover:bg-[#9a4318] active:scale-95 transition-all border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318] min-h-[44px]"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('dashboard.addBtn')}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} onDelete={handleDelete} />
            ))}
          </div>
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
            <Link
              to="/terms"
              className="hover:text-[#a08060] transition-colors underline underline-offset-2"
            >
              이용약관
            </Link>
            <span className="text-[#b07840]">·</span>
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
