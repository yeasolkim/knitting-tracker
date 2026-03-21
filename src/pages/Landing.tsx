import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      {/* Nav */}
      <nav className="px-5 sm:px-8 h-14 flex items-center justify-between">
        <span className="font-bold text-gray-900 tracking-tight text-lg">코따</span>
        <Link
          to="/login"
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors min-h-[44px] flex items-center"
        >
          로그인
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 text-center -mt-8">
        <p className="text-[11px] font-semibold tracking-widest text-rose-400 uppercase mb-5">
          Knitting Tracker
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 leading-tight mb-5">
          내 도안,
          <br />
          언제나 이어서.
        </h1>
        <p className="text-base sm:text-lg text-gray-400 max-w-sm leading-relaxed mb-10">
          도안 파일을 올리면<br />
          지금 뜨는 단을 기억해 둡니다.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-3 bg-gray-900 text-white px-7 py-3.5 rounded-full text-sm font-medium hover:bg-gray-700 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google로 시작하기
        </Link>

        {/* Feature strip */}
        <div className="mt-16 sm:mt-20 flex items-center gap-5 sm:gap-8 text-xs sm:text-sm text-gray-400 flex-wrap justify-center">
          {['이미지 · PDF 도안', '진행선 표시', '단수 카운터', '자동 저장'].map((f, i) => (
            <span key={f} className="flex items-center gap-2">
              {i > 0 && <span className="w-px h-3 bg-gray-200 hidden sm:block" />}
              {f}
            </span>
          ))}
        </div>

        <p className="mt-5 text-xs text-gray-300">
          코바늘 · 대바늘 모두 사용 가능
        </p>
      </main>

      <footer className="py-6 text-center text-xs text-gray-300">
        © 2026 코따
      </footer>
    </div>
  );
}
