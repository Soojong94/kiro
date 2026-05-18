// 비로그인 사용자에게 랭킹 자리에 노출하는 게이트 카드.
// 페이지 헤더는 그대로 두고 본문만 잠금 상태로 표시.

import Link from "next/link";

export function LoginGateCard({
  message = "랭킹을 보려면 로그인이 필요합니다.",
}: {
  message?: string;
}) {
  return (
    <div className="rounded-lg bg-white p-8 sm:p-12 shadow-[0_1px_2px_rgba(0,28,36,0.05)] ring-1 ring-[#eaeded] text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-[#f2f8fd] flex items-center justify-center mb-4">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M6 9V6.5a4 4 0 1 1 8 0V9M5 9h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
            stroke="#0972d3"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-[16px] sm:text-[18px] font-bold text-[#16191f] tracking-tight">
        로그인 해주세요
      </h3>
      <p className="mt-1.5 text-[13px] text-[#5f6b7a]">{message}</p>
      <Link
        href="/login"
        className="mt-5 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-[#0972d3] text-white text-[13.5px] font-semibold hover:bg-[#033160] transition-colors"
      >
        로그인 페이지로
      </Link>
      <p className="mt-3 text-[11.5px] text-[#95a5b8]">
        계정은 학교 관리자가 발급합니다
      </p>
    </div>
  );
}
