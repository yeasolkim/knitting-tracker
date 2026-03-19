import { Link, useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/supabase/client';

export default function Navbar({ userEmail }: { userEmail?: string }) {
  const navigate = useNavigate();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <nav className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between">
        <Link to={userEmail ? '/dashboard' : '/'} className="flex items-center gap-2 min-h-[44px]">
          <span className="text-xl">🧶</span>
          <span className="font-semibold text-gray-800 text-sm sm:text-base">시로라기</span>
        </Link>

        {userEmail ? (
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-xs sm:text-sm text-gray-500 hidden sm:block truncate max-w-[150px]">{userEmail}</span>
            <button
              onClick={handleLogout}
              className="text-xs sm:text-sm text-gray-500 hover:text-gray-800 transition-colors min-h-[44px] px-2 flex items-center"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="text-sm bg-rose-400 text-white px-4 py-2 min-h-[44px] flex items-center rounded-full hover:bg-rose-500 transition-colors"
          >
            시작하기
          </Link>
        )}
      </div>
    </nav>
  );
}
