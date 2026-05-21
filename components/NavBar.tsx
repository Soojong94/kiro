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
              className="px-3 py-1.5 rounded-md bg-white/10 text-white text-[12px] font-semibold hover:bg-white/20 transition-colors cursor-pointer"
            >
              홈
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!hideAuth && loggedIn && (
            <>
              <span className="hidden sm:inline text-[12.5px] text-[#d1d5db]">
                {session.username}
              </span>
              <form action={studentLogoutAction}>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-white/10 text-white text-[12px] font-semibold hover:bg-white/20 transition-colors cursor-pointer"
                >
                  로그아웃
                </button>
              </form>
              <Link
                href="/leave"
                className="text-[11px] text-white/35 hover:text-white/70 transition-colors"
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
