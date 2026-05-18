import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import {
  recoverUsernameAction,
  requestPasswordResetAction,
} from "./actions";

export const metadata = {
  title: "계정 찾기 · Kiro 통합 랭킹",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "empty") return "이메일을 입력해주세요.";
  if (code === "send_failed") return "메일 발송에 실패했습니다. 잠시 후 다시 시도하세요.";
  return "오류가 발생했습니다.";
}

export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const sent = (Array.isArray(sp.sent) ? sp.sent[0] : sp.sent) === "1";

  const isPassword = t === "password";
  const title = isPassword ? "비밀번호 찾기" : "아이디 찾기";
  const description = isPassword
    ? "가입 시 등록한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다 (1시간 유효)."
    : "가입 시 등록한 이메일을 입력하면 아이디를 알려드립니다.";
  const action = isPassword ? requestPasswordResetAction : recoverUsernameAction;
  const otherType = isPassword ? "username" : "password";
  const otherLabel = isPassword ? "아이디 찾기" : "비밀번호 찾기";

  const errMsg = errorMessage(errCode);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#fafafa" }}>
      <NavBar hideAuth />
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-6">
            <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
              {title}
            </h1>
          </div>

          <div className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] p-6">
            {sent ? (
              <div className="text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-[#f1f8f5] flex items-center justify-center mb-3">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M4 10.5l4 4 8-8" stroke="#1d6638" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-semibold text-[#16191f]">
                  메일을 보냈습니다
                </p>
                <p className="mt-2 text-[12.5px] text-[#5f6b7a] leading-relaxed">
                  입력하신 이메일이 등록되어 있다면 곧 메일이 도착합니다.
                  <br />
                  스팸함도 확인해주세요.
                </p>
                <Link
                  href="/login"
                  className="mt-5 inline-flex items-center text-[13px] text-[#0972d3] font-semibold hover:underline cursor-pointer"
                >
                  ← 로그인 페이지로
                </Link>
              </div>
            ) : (
              <form action={action} className="space-y-4">
                <p className="text-[13px] text-[#414d5c] leading-relaxed">
                  {description}
                </p>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-[12px] font-semibold text-[#414d5c] mb-1.5"
                  >
                    이메일
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@school.kr"
                    className="w-full px-3 py-2 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[14px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
                  />
                </div>

                {errMsg && (
                  <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
                    {errMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-md bg-[#0972d3] text-white text-[14px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer"
                >
                  메일 받기
                </button>

                <div className="flex justify-between text-[12px] pt-1">
                  <Link
                    href={`/login/recover?type=${otherType}`}
                    className="text-[#5f6b7a] hover:text-[#0972d3] hover:underline cursor-pointer"
                  >
                    {otherLabel}
                  </Link>
                  <Link
                    href="/login"
                    className="text-[#5f6b7a] hover:text-[#0972d3] hover:underline cursor-pointer"
                  >
                    로그인으로
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
