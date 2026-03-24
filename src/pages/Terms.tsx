import { Link } from 'react-router-dom';

export default function Terms() {
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

        <h1 className="text-2xl font-bold text-[#3d2b1f] mb-2 tracking-tight">이용약관</h1>
        <p className="text-xs text-[#a08060] mb-10">시행일: 2026년 1월 1일</p>

        <div className="space-y-8 text-sm text-[#3d2b1f] leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제1조 (목적)</h2>
            <p>
              이 약관은 니팅인더사우나(이하 "서비스")가 제공하는 뜨개질 도안 진행 추적 서비스의 이용 조건 및 절차, 서비스 제공자와 이용자의 권리·의무·책임 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제2조 (정의)</h2>
            <ul className="space-y-1.5 list-none">
              <li><span className="font-semibold">① "서비스"</span>란 니팅인더사우나가 제공하는 웹 애플리케이션 및 관련 서비스 일체를 말합니다.</li>
              <li><span className="font-semibold">② "이용자"</span>란 이 약관에 동의하고 서비스를 이용하는 자를 말합니다.</li>
              <li><span className="font-semibold">③ "계정"</span>이란 이용자가 서비스 이용을 위해 등록한 이메일 및 인증 정보를 말합니다.</li>
              <li><span className="font-semibold">④ "콘텐츠"</span>란 이용자가 서비스에 업로드하는 도안 파일, 메모, 진행 정보 등 일체의 데이터를 말합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제3조 (약관의 효력 및 변경)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 이 약관은 서비스 화면에 게시하거나 이용자에게 공지함으로써 효력이 발생합니다.</li>
              <li>② 서비스는 관련 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 시행일 7일 전에 공지합니다.</li>
              <li>③ 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 계정을 삭제할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제4조 (서비스 이용)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 서비스는 이메일 기반 계정 가입 후 이용할 수 있습니다.</li>
              <li>② 이용자는 타인의 계정을 사용하거나 타인에게 자신의 계정을 양도할 수 없습니다.</li>
              <li>③ 서비스는 안정적인 운영을 위해 사전 고지 없이 서비스의 일부 또는 전부를 변경하거나 중단할 수 있습니다.</li>
              <li>④ 서비스는 무료로 제공되나, 운영 상황에 따라 유료 전환 또는 기능 변경이 있을 수 있으며, 이 경우 사전 공지합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제5조 (이용자의 의무)</h2>
            <p className="mb-2">이용자는 다음 행위를 하여서는 안 됩니다.</p>
            <ul className="space-y-1.5 list-disc list-inside text-[#5a3e2e]">
              <li>타인의 저작권을 침해하는 도안 파일의 업로드 및 배포</li>
              <li>서비스의 정상적인 운영을 방해하는 행위</li>
              <li>서비스를 통해 불법 콘텐츠를 배포하는 행위</li>
              <li>타인의 개인정보를 수집하거나 침해하는 행위</li>
              <li>관련 법령 또는 이 약관에서 금지하는 행위</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제6조 (콘텐츠 및 저작권)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 이용자가 업로드한 콘텐츠의 저작권 및 책임은 해당 이용자에게 있습니다.</li>
              <li>② 서비스는 이용자의 콘텐츠를 서비스 운영 목적 외에 사용하지 않습니다.</li>
              <li>③ 타인의 저작권을 침해하는 콘텐츠를 업로드한 경우, 그에 따른 법적 책임은 이용자 본인에게 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제7조 (서비스 중단 및 데이터)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 서비스는 천재지변, 기술적 장애, 운영 정책 변경 등의 사유로 사전 예고 없이 중단될 수 있습니다.</li>
              <li>② 서비스 종료 시 이용자에게 30일 이전에 공지하며, 이용자는 해당 기간 내 데이터를 직접 백업해야 합니다.</li>
              <li>③ 서비스는 데이터의 영구 보존을 보장하지 않으며, 중요한 데이터는 별도 저장을 권장합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제8조 (책임의 제한)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 서비스는 이용자의 귀책 사유로 발생한 손해에 대하여 책임을 지지 않습니다.</li>
              <li>② 서비스는 천재지변, 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
              <li>③ 서비스는 이용자 간 또는 이용자와 제3자 사이에 발생한 분쟁에 개입하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-[#3d2b1f] mb-3 pb-2 border-b-2 border-[#78b0a8]">제9조 (준거법 및 분쟁 해결)</h2>
            <ul className="space-y-1.5 list-none">
              <li>① 이 약관은 대한민국 법령에 따라 해석됩니다.</li>
              <li>② 서비스 이용과 관련된 분쟁은 서울중앙지방법원을 관할 법원으로 합니다.</li>
            </ul>
          </section>

          <section className="bg-[#eef8f5] border-2 border-[#78b0a8] rounded-xl p-4">
            <h2 className="text-base font-bold text-[#3d2b1f] mb-2">문의</h2>
            <p className="text-[#7a5c46]">
              약관에 관한 문의는 Instagram{' '}
              <a
                href="https://www.instagram.com/knitting_in_the_sauna"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#b5541e] underline underline-offset-2 hover:text-[#9a4318]"
              >
                @knitting_in_the_sauna
              </a>
              으로 연락해 주세요.
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
