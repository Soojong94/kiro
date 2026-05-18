// /admin 보호 영역. 세션 없으면 로그인 페이지로 리다이렉트.
// /admin/login 은 이 레이아웃 밖에 있어서 게이트에 안 걸림.

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { logoutAction } from "../login/actions";

const NAV_ITEMS: { href: string; label: string; superOnly?: boolean }[] = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/students", label: "학생 계정" },
  { href: "/admin/schools", label: "학교", superOnly: true },
  { href: "/admin/admins", label: "관리자", superOnly: true },
];

export default async function AdminAuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // 마이그레이션 전 세션은 role 없음. 쿠키 수정은 레이아웃에서 불가하므로
  // (Next 제약) 그냥 로그인으로 보냄 — 로그인 페이지가 stale 세션도 통과시킴.
  if (!session.adminId || !session.role || !session.username) {
    redirect("/admin/login?error=session_stale");
  }
  const isSuper = session.role === "super";

  return (
    <div className="min-h-screen" style={{ background: "#fafafa" }}>
      <header
        className="w-full"
        style={{
          background: "#232f3e",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="mx-auto max-w-6xl px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2.5 cursor-pointer"
              aria-label="Kiro 관리자 홈"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kiro-logo.jpg"
                alt="AWS Kiro"
                className="h-9 w-auto rounded-md"
              />
              <span className="text-[11px] font-extrabold tracking-wider text-[#ec7211] px-1.5 py-0.5 rounded bg-white/10">
                ADMIN
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1 text-[12.5px]">
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
          <div className="flex items-center gap-3 text-[12.5px]">
            <span className="text-[#d1d5db]">
              {session.username}
              {isSuper ? (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#ec7211] text-white text-[10px] font-bold align-middle">
                  SUPER
                </span>
              ) : (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-white/15 text-white text-[10px] font-bold align-middle">
                  {session.schoolId}
                </span>
              )}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors font-semibold cursor-pointer"
              >
                로그아웃
              </button>
            </form>
            <a
              href="https://tbit.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
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
      </header>
      {children}
    </div>
  );
}
