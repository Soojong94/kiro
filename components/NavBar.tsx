import Link from "next/link";
import { KiroLogo } from "./KiroLogo";
import { TbitLogo } from "./TbitLogo";
import { getStudentSession } from "@/lib/student-auth";
import { studentLogoutAction } from "@/app/login/actions";

// 페이지 최상단 풀폭 NavBar. AWS Squid Ink 톤(다크 네이비).
// 좌: Kiro 로고 / 우: 회사 로고 + 로그인 상태.
// hideAuth=true 면 로그인/로그아웃 버튼 숨김 (로그인 페이지에서 사용).
export async function NavBar({ hideAuth = false }: { hideAuth?: boolean } = {}) {
  const session = await getStudentSession();
  const loggedIn = !!session.userId;

  return (
    <div
      className="w-full"
      style={{
        background: "#232f3e",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="mx-auto max-w-5xl px-5 sm:px-6 h-16 sm:h-18 lg:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <KiroLogo />
          {!hideAuth && loggedIn && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/15 ring-1 ring-white/20 text-white text-[13px] font-semibold hover:bg-white/25 hover:ring-white/30 transition-all cursor-pointer"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 12L12 3l9 9" />
                <path d="M5 10v10h14V10" />
              </svg>
              홈
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {!hideAuth && loggedIn && (
            <>
              <span className="hidden sm:inline text-[12.5px] text-[#d1d5db]">
                {session.username}
              </span>
              <form action={studentLogoutAction}>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-white/15 ring-1 ring-white/20 text-white text-[13px] font-semibold hover:bg-white/25 hover:ring-white/30 transition-all cursor-pointer"
                >
                  로그아웃
                </button>
              </form>
              <Link
                href="/leave"
                className="px-3 py-2 rounded-lg ring-1 ring-white/15 text-[12px] font-medium text-white/70 hover:text-white hover:ring-white/30 hover:bg-white/5 transition-all cursor-pointer"
              >
                탈퇴
              </Link>
            </>
          )}
          {!hideAuth && !loggedIn && (
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-md bg-[#0972d3] text-white text-[12.5px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer"
            >
              로그인
            </Link>
          )}
          <TbitLogo />
        </div>
      </div>
    </div>
  );
}
