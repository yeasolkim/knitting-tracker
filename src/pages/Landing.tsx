import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 mb-4">
            뜨개질을 더 쉽게,
            <br />
            <span className="text-rose-400">단 단위로 추적</span>하세요
          </h1>
          <p className="text-lg text-gray-500 mb-8 max-w-xl mx-auto">
            도안 파일을 업로드하면 단 표시 룰러와 카운터로
            <br />
            어디까지 떴는지 놓치지 않아요.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-rose-400 text-white px-8 py-3 rounded-full text-lg font-medium hover:bg-rose-500 transition-colors shadow-lg shadow-rose-200"
          >
            시작하기
          </Link>
        </div>

        <div className="mt-20 grid sm:grid-cols-3 gap-8">
          {[
            {
              icon: '📄',
              title: '도안 업로드',
              desc: '이미지 또는 PDF 도안 파일을 업로드하세요. 드래그 앤 드롭도 지원해요.',
            },
            {
              icon: '📏',
              title: '진행선',
              desc: '드래그 가능한 진행선으로 현재 뜨고 있는 단을 표시하세요.',
            },
            {
              icon: '🔢',
              title: '단 & 코 카운터',
              desc: '단 수와 코 수를 간편하게 세고, 자동으로 저장돼요.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-white border border-gray-100 rounded-2xl p-6 text-center"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="font-semibold text-gray-800 mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-500">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-gray-400">
            코바늘 &amp; 대바늘 모두 지원 · Google 계정으로 간편 로그인
          </p>
        </div>
      </main>
    </div>
  );
}
