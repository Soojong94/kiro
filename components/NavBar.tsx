import { KiroLogo } from "./KiroLogo";
import { TbitLogo } from "./TbitLogo";

// 페이지 최상단 풀폭 NavBar (Kiro 보라 톤).
// 좌: Kiro 로고 / 우: 회사(TBT) 로고. 다크 배경에서 흰 로고가 또렷.
export function NavBar() {
  return (
    <div
      className="w-full"
      style={{
        background: "var(--color-kiro-bg)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="mx-auto max-w-5xl px-5 sm:px-6 h-16 sm:h-18 lg:h-20 flex items-center justify-between gap-4">
        <KiroLogo />
        <TbitLogo />
      </div>
    </div>
  );
}
