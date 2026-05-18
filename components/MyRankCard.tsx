// 로그인한 학생의 본인 순위 핀 카드. 랭킹 테이블에서 스크롤로 찾지 않아도
// 항상 상단에 노출되어 한눈에 본인 위치 파악 가능.
// 현재 기간/메트릭/학교 필터의 결과 안에 본인이 있을 때만 렌더.

import type { RankRow } from "@/lib/types";

const TROPHY_BADGE: Record<number, string> = {
  1: "#ec7211", // 1위 AWS 오렌지
  2: "#879596",
  3: "#a06a3f",
};

export function MyRankCard({
  row,
  unitLabel,
}: {
  row: RankRow;
  unitLabel: string;
}) {
  const badgeBg = TROPHY_BADGE[row.rank] ?? "#0972d3";
  return (
    <div className="mb-3 sm:mb-4 rounded-lg bg-[#f2f8fd] ring-1 ring-[#0972d3] shadow-[0_1px_2px_rgba(9,114,211,0.08)] px-4 py-3 sm:px-5 sm:py-3.5 flex items-center gap-3 sm:gap-4">
      <span className="text-[10px] font-extrabold text-[#0972d3] tracking-wider shrink-0">
        내 순위
      </span>

      <span
        className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full text-white text-[12.5px] font-bold tabular-nums shrink-0"
        style={{ background: badgeBg }}
        aria-label={`${row.rank}위`}
      >
        {row.rank}
      </span>

      <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
        <span className="font-bold text-[14.5px] sm:text-[15.5px] text-[#16191f] truncate">
          {row.maskedName}
        </span>
        <span className="text-[11.5px] sm:text-[12px] text-[#5f6b7a] truncate">
          {row.schoolName}
        </span>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[16px] sm:text-[18px] font-bold tabular-nums text-[#16191f] leading-tight">
          {row.value.toLocaleString("ko-KR")}
        </div>
        <div className="text-[10.5px] text-[#5f6b7a] leading-tight">
          {unitLabel}
        </div>
      </div>
    </div>
  );
}
