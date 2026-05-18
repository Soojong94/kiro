import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { loginAction } from "./actions";

export const metadata = {
  title: "관리자 로그인 · Kiro",
};

function errorMessage(code: string | undefined, sec: string | undefined): string | null {
  if (!code) return null;
  if (code === "empty") return "아이디와 비밀번호를 모두 입력해주세요.";
  if (code === "locked") return `로그인 시도 너무 많음. ${sec ?? "60"}초 후 다시 시도하세요.`;
  if (code === "invalid") return "아이디 또는 비밀번호가 올바르지 않습니다.";
  if (code === "session_stale") return "세션이 만료되어 다시 로그인해주세요.";
  return "로그인에 실패했습니다.";
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 이미 정상 로그인된 경우 대시보드로 (stale 세션은 여기서 무시 — 새 로그인이 덮어씀)
  const session = await getSession();
  if (session.adminId && session.role && session.username) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const sec = Array.isArray(sp.sec) ? sp.sec[0] : sp.sec;
  const msg = errorMessage(errCode, sec);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "#fafafa" }}
    >
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-bold tracking-tight text-[#16191f]">
            Kiro 관리자
          </h1>
          <p className="text-[13px] text-[#5f6b7a] mt-1.5">
            사내 운영 대시보드
          </p>
        </div>

        <form
          action={loginAction}
          className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="username"
              className="block text-[12px] font-semibold text-[#414d5c] mb-1.5"
            >
              아이디
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              autoFocus
              className="w-full px-3 py-2 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[14px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-[12px] font-semibold text-[#414d5c] mb-1.5"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[14px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
          </div>

          {msg && (
            <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
              {msg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-md bg-[#232f3e] text-white text-[14px] font-semibold hover:bg-[#161e2d] transition-colors"
          >
            로그인
          </button>
        </form>

        <p className="mt-6 text-center text-[11.5px] text-[#95a5b8]">
          관리자 전용 페이지입니다
        </p>
      </div>
    </div>
  );
}
