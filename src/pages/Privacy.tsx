import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        {/* Back */}
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5c46] mb-8 transition-colors tracking-wide font-medium"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          홈으로
        </Link>

        <h1 className="text-2xl font-bold text-[#3d2b1f] mb-2 tracking-tight">개인정보처리방침</h1>
        <p className="text-xs text-[#a08060] mb-10">시행일: 2026년 1월 1일</p>

        <div className="space-y-8 text-sm text-[#3d2b1f] leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제1조 (개요)</h2>
            <p>
              니팅탕(이하 "서비스")는 이용자의 개인정보를 중요하게 생각합니다. 이 개인정보처리방침은 서비스가 어떤 정보를 수집하고, 어떻게 사용하며, 어떻게 보호하는지 안내합니다. 본 방침은 「개인정보 보호법」 및 관련 법령을 준수합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제2조 (수집하는 개인정보 항목)</h2>
            <div className="space-y-3">
              <div>
                <p className="font-semibold mb-1.5">① 회원가입 시 수집 항목</p>
                <ul className="list-disc list-inside text-[#5a3e2e] space-y-1 pl-2">
                  <li>이메일 주소 (필수)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1.5">② 서비스 이용 시 자동 수집 항목</p>
                <ul className="list-disc list-inside text-[#5a3e2e] space-y-1 pl-2">
                  <li>서비스 이용 기록 (도안 업로드, 진행 데이터)</li>
                  <li>접속 IP 주소, 브라우저 종류 (서비스 안정성 목적)</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1.5">③ 이용자가 직접 입력하는 정보</p>
                <ul className="list-disc list-inside text-[#5a3e2e] space-y-1 pl-2">
                  <li>도안 파일 (이미지, PDF)</li>
                  <li>도안 제목, 실/바늘 정보, 메모, 진행 현황</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제3조 (개인정보 수집 및 이용 목적)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f5edd6]">
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">수집 항목</th>
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">이용 목적</th>
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">보유 기간</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[#d4b896] px-3 py-2">이메일 주소</td>
                    <td className="border border-[#d4b896] px-3 py-2">계정 인증, 로그인, 서비스 공지</td>
                    <td className="border border-[#d4b896] px-3 py-2">회원 탈퇴 시까지</td>
                  </tr>
                  <tr className="bg-[#fdf6e8]">
                    <td className="border border-[#d4b896] px-3 py-2">도안 파일</td>
                    <td className="border border-[#d4b896] px-3 py-2">서비스 제공 (도안 표시)</td>
                    <td className="border border-[#d4b896] px-3 py-2">이용자 삭제 또는 탈퇴 시까지</td>
                  </tr>
                  <tr>
                    <td className="border border-[#d4b896] px-3 py-2">진행 데이터</td>
                    <td className="border border-[#d4b896] px-3 py-2">뜨개 진행 현황 저장 및 복원</td>
                    <td className="border border-[#d4b896] px-3 py-2">이용자 삭제 또는 탈퇴 시까지</td>
                  </tr>
                  <tr className="bg-[#fdf6e8]">
                    <td className="border border-[#d4b896] px-3 py-2">접속 로그</td>
                    <td className="border border-[#d4b896] px-3 py-2">서비스 안정성 확인, 부정 이용 방지</td>
                    <td className="border border-[#d4b896] px-3 py-2">3개월</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제4조 (개인정보의 제3자 제공 및 국외 이전)</h2>
            <p className="mb-3">서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 단, 아래의 경우 서비스 운영을 위해 개인정보가 국외 서버에 저장됩니다.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f5edd6]">
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">수탁업체</th>
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">이전 국가</th>
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">이전 항목</th>
                    <th className="border border-[#d4b896] px-3 py-2 text-left font-bold">목적</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-[#d4b896] px-3 py-2">Supabase Inc.</td>
                    <td className="border border-[#d4b896] px-3 py-2">미국</td>
                    <td className="border border-[#d4b896] px-3 py-2">이메일, 진행 데이터</td>
                    <td className="border border-[#d4b896] px-3 py-2">데이터베이스 및 인증 서비스</td>
                  </tr>
                  <tr className="bg-[#fdf6e8]">
                    <td className="border border-[#d4b896] px-3 py-2">Cloudflare Inc.</td>
                    <td className="border border-[#d4b896] px-3 py-2">미국</td>
                    <td className="border border-[#d4b896] px-3 py-2">도안 파일</td>
                    <td className="border border-[#d4b896] px-3 py-2">파일 저장 서비스 (R2)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[#7a5c46]">위 업체들은 각각의 개인정보처리방침에 따라 데이터를 처리하며, 서비스 제공 목적 외 용도로 사용하지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제5조 (개인정보의 파기)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 이용자가 계정을 삭제하면 이메일을 포함한 계정 정보 및 업로드한 도안 파일, 진행 데이터가 즉시 삭제됩니다.</li>
              <li>② 법령에 의해 보존이 필요한 경우 해당 기간 동안 별도 보관 후 파기합니다.</li>
              <li>③ 전자적 파일 형태의 개인정보는 복구가 불가능한 방법으로 영구 삭제합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제6조 (이용자의 권리)</h2>
            <p className="mb-2">이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
            <ul className="list-disc list-inside text-[#5a3e2e] space-y-1 pl-2">
              <li>개인정보 열람 요청</li>
              <li>개인정보 수정 요청</li>
              <li>개인정보 삭제 요청 (계정 삭제)</li>
              <li>개인정보 처리 정지 요청</li>
            </ul>
            <p className="mt-3">권리 행사는 서비스 내 계정 설정 또는 아래 연락처를 통해 가능합니다. 요청 접수 후 10일 이내에 처리합니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제7조 (쿠키 및 세션)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 서비스는 로그인 상태 유지를 위해 브라우저 로컬스토리지에 인증 토큰을 저장합니다.</li>
              <li>② 별도의 광고 목적 쿠키는 사용하지 않습니다.</li>
              <li>③ 브라우저 설정을 통해 저장된 인증 정보를 삭제할 수 있으나, 이 경우 로그인이 해제됩니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제8조 (개인정보 보호책임자)</h2>
            <div className="bg-[#fdf6e8] border-2 border-[#d4b896] rounded-xl p-4 space-y-1">
              <p><span className="font-semibold">서비스명:</span> 니팅탕 (Knitting-tang)</p>
              <p><span className="font-semibold">문의 채널:</span>{' '}
                <a
                  href="https://www.instagram.com/knitting_tang_official"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#b5541e] underline underline-offset-2 hover:text-[#9a4318]"
                >
                  Instagram @knitting_tang_official
                </a>
              </p>
              <p className="text-xs text-[#a08060] mt-1">개인정보 관련 문의, 열람·삭제 요청은 위 채널로 연락해 주세요.</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#d4b896]">제9조 (방침 변경)</h2>
            <p>
              이 개인정보처리방침은 법령 또는 서비스 정책 변경 시 개정될 수 있습니다. 변경 시 서비스 내 공지를 통해 안내하며, 중요한 변경사항은 시행일 7일 전에 사전 공지합니다.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
