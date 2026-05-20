// /admin 보호 영역. 세션 없으면 로그인 페이지로 리다이렉트.
// /admin/login 은 이 레이아웃 밖에 있어서 게이트에 안 걸림.

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PasswordExpiryModal } from "@/components/PasswordExpiryModal";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { logoutAction } from "../login/actions";

const NAV_ITEMS: { href: string; label: string; superOnly?: boolean }[] = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/students", label: "학생 계정" },
  { href: "/admin/schools", label: "학교", superOnly: true },
  { href: "/admin/connections", label: "AWS 연결", superOnly: true },
  { href: "/admin/admins", label: "관리자", superOnly: true },
];

export default async function AdminAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.adminId) {
    // 세션 자체 없음 — 평범한 비로그인. 메시지 없이 로그인 페이지로.
    redirect("/admin/login");
  }
  if (!session.role || !session.username) {
    // 쿠키는 있는데 필드가 불완전 — 마이그레이션 전 옛 세션. 메시지 표시 후 새 로그인 유도.
    redirect("/admin/login?error=session_stale");
  }
  const isSuper = session.role === "super";

  // 비번 나이 조회 (90일 이상이면 클라이언트가 모달 띄움)
  const { rows: ageRows } = await pool.query<{ days: string }>(
    `SELECT EXTRACT(EPOCH FROM (now() - password_changed_at)) / 86400 AS days
       FROM admins WHERE id = $1`,
    [session.adminId],
  );
  const passwordAgeDays = Math.floor(Number(ageRows[0]?.days ?? 0));

  return (
    <div className="min-h-screen" style={{ background: "#fafafa" }}>
      <header
        className="w-full"
        style={{
          background: "#232f3e",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* 상단 행: 로고 + 사용자 정보. 모바일에서도 한 줄 유지. */}
          <div className="h-14 sm:h-16 flex items-center justify-between gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 cursor-pointer shrink-0"
              aria-label="Kiro 관리자 홈"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kiro-logo.jpg"
                alt="AWS Kiro"
                className="h-8 sm:h-9 w-auto rounded-md"
              />
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-wider text-[#ec7211] px-1.5 py-0.5 rounded bg-white/10">
                ADMIN
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3 text-[11.5px] sm:text-[12.5px] min-w-0">
              <span className="text-[#d1d5db] truncate max-w-[120px] sm:max-w-none">
                {session.username}
                {isSuper ? (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#ec7211] text-white text-[9.5px] sm:text-[10px] font-bold align-middle">
                    SUPER
                  </span>
                ) : (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded bg-white/15 text-white text-[9.5px] sm:text-[10px] font-bold align-middle">
                    {session.schoolId}
                  </span>
                )}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors font-semibold cursor-pointer"
                >
                  로그아웃
                </button>
              </form>
              <a
                href="https://tbit.co.kr"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center"
                aria-label="으뜸정보기술 TBIT"
              >
                <Image
                  src="/logo-tbit-white.png"
                  alt="으뜸정보기술 TBIT"
                  width={2104}
                  height={513}
                  className="h-7 w-auto"
                />
              </a>
            </div>
          </div>
          {/* 하단 행: 네비 메뉴. 모바일에선 가로 스크롤로 잘림 방지. */}
          <nav className="-mx-1 pb-2 sm:pb-2.5 flex items-center gap-1 text-[12.5px] overflow-x-auto whitespace-nowrap">
            {NAV_ITEMS.filter((n) => !n.superOnly || isSuper).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-2.5 py-1.5 rounded-md text-[#d1d5db] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
      <PasswordExpiryModal ageDays={passwordAgeDays} />
    </div>
  );
}
