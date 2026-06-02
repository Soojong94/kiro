import Link from "next/link";
import { NavBar } from "@/components/NavBar";

export const metadata = {
  title: "비밀번호 설정 메일 발송 · Kiro 통합 랭킹",
};

export default async function EmailSentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const email = (Array.isArray(sp.email) ? sp.email[0] : sp.email) ?? "";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#fafafa" }}>
      <NavBar hideAuth />
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[440px]">
          <div className="text-center mb-6">
            <div className="text-[40px] mb-3">📧</div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
              비밀번호 설정 메일을 보냈습니다
            </h1>
            {email && (
              <p className="text-[13.5px] text-[#414d5c] mt-3">
                <span className="font-mono">{email}</span> 로 발송했어요
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-[#eaeded] p-5 space-y-3 text-[13px] text-[#414d5c] leading-relaxed">
            <p>
              메일에 있는 <strong>비밀번호 설정</strong> 버튼을 눌러 본인이 사용할 비밀번호를
              설정해주세요. 링크는 <strong>1시간 동안 유효</strong>합니다.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[12.5px] text-[#5f6b7a]">
              <li>메일이 안 보이면 스팸함을 확인해주세요.</li>
              <li>이메일이 잘못 등록되어 있다면 학교 관리자에게 수정 요청해주세요.</li>
              <li>1시간이 지났다면 다시 로그인 시도하면 새 메일을 보내드립니다.</li>
            </ul>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-block text-[13px] text-[#0972d3] hover:underline"
            >
              ← 로그인 페이지로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
