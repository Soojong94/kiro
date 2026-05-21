import Link from "next/link";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { getStudentSession } from "@/lib/student-auth";
import { studentLoginAction } from "./actions";

export const metadata = {
  title: "로그인 · Kiro 통합 랭킹",
};

function errorMessage(code?: string, sec?: string): string | null {
  if (!code) return null;
  if (code === "empty") return "아이디와 비밀번호를 모두 입력해주세요.";
  if (code === "locked") return `시도 너무 많음. ${sec ?? "60"}초 후 다시 시도하세요.`;
  if (code === "invalid") return "아이디 또는 비밀번호가 올바르지 않습니다.";
  return "로그인에 실패했습니다.";
}

export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getStudentSession();
  if (session.userId) {
    redirect(session.mustChangePassword ? "/change-password" : "/");
  }

  const sp = await searchParams;
  const code = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const sec = Array.isArray(sp.sec) ? sp.sec[0] : sp.sec;
  const reset = (Array.isArray(sp.reset) ? sp.reset[0] : sp.reset) === "1";
  const left = (Array.isArray(sp.left) ? sp.left[0] : sp.left) === "1";
  const deactivated =
    (Array.isArray(sp.deactivated) ? sp.deactivated[0] : sp.deactivated) === "1";
  const msg = errorMessage(code, sec);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#fafafa" }}>
      <NavBar hideAuth />
      <div className="flex-1 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <h1 className="text-[24px] font-bold tracking-tight text-[#16191f]">
            AWS Kiro 통합 랭킹
          </h1>
          <p className="text-[13px] text-[#5f6b7a] mt-1.5">
            학생 로그인
          </p>
        </div>

        <form
          action={studentLoginAction}
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

          {reset && !msg && (
            <div className="rounded-md bg-[#f1f8f5] ring-1 ring-[#9bd4b7] px-3 py-2 text-[12.5px] text-[#1d6638]">
              비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해주세요.
            </div>
          )}
          {left && !msg && (
            <div className="rounded-md bg-[#f4f5f7] ring-1 ring-[#d5dbdb] px-3 py-2 text-[12.5px] text-[#5f6b7a]">
              탈퇴 처리가 완료되었습니다. 복구는 학교 관리자에게 문의해주세요.
            </div>
          )}
          {deactivated && !msg && !left && (
            <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
              탈퇴 처리된 계정입니다. 학교 관리자에게 복구를 요청해주세요.
            </div>
          )}
          {msg && (
            <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
              {msg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-md bg-[#0972d3] text-white text-[14px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer"
          >
            로그인
          </button>

          <div className="flex justify-between text-[12px] pt-1">
            <Link
              href="/login/recover?type=username"
              className="text-[#5f6b7a] hover:text-[#0972d3] hover:underline"
            >
              아이디 찾기
            </Link>
            <Link
              href="/login/recover?type=password"
              className="text-[#5f6b7a] hover:text-[#0972d3] hover:underline"
            >
              비밀번호 찾기
            </Link>
          </div>
        </form>

        <p className="mt-6 text-center text-[11.5px] text-[#95a5b8]">
          계정은 학교 관리자가 발급합니다
        </p>
      </div>
      </div>
    </div>
  );
}
