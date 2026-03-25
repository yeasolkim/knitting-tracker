import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (id === 'admin' && pw === '1227') {
      sessionStorage.setItem('admin_auth', 'true');
      navigate('/admin/dashboard');
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5edd6]">
      <div className="bg-[#fdf6e8] border-2 border-[#b07840] rounded-xl shadow-[4px_4px_0_#b07840] p-8 w-full max-w-xs">
        <h1 className="text-lg font-bold text-[#3d2b1f] mb-1 tracking-tight">관리자 로그인</h1>
        <p className="text-xs text-[#a08060] mb-6">니팅인더사우나 어드민</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="아이디"
            value={id}
            onChange={e => { setId(e.target.value); setError(false); }}
            className="border-2 border-[#b07840] rounded-lg px-3 py-2.5 text-sm bg-[#f5edd6] text-[#3d2b1f] placeholder-[#c4a07a] outline-none focus:border-[#b5541e] transition-colors"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(false); }}
            className="border-2 border-[#b07840] rounded-lg px-3 py-2.5 text-sm bg-[#f5edd6] text-[#3d2b1f] placeholder-[#c4a07a] outline-none focus:border-[#b5541e] transition-colors"
          />
          {error && <p className="text-xs text-red-500">아이디 또는 비밀번호가 틀렸어요.</p>}
          <button
            type="submit"
            className="mt-1 bg-[#b5541e] text-[#fdf6e8] rounded-lg py-2.5 text-sm font-bold tracking-wide hover:bg-[#9a4318] transition-colors border-2 border-[#9a4318] shadow-[2px_2px_0_#9a4318]"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
