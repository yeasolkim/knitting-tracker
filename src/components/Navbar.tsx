'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function Navbar({ userEmail }: { userEmail?: string }) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={userEmail ? '/dashboard' : '/'} className="flex items-center gap-2">
          <span className="text-xl">🧶</span>
          <span className="font-semibold text-gray-800">뜨개 트래커</span>
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm bg-rose-400 text-white px-4 py-2 rounded-full hover:bg-rose-500 transition-colors"
          >
            시작하기
          </Link>
        )}
      </div>
    </nav>
  );
}
