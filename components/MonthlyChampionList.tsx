import type { MonthlyChampion } from "@/lib/ranking";

// 지난 12개월 월별 1등. <details>로 펼침/접힘 — JS 없이 동작.
export function MonthlyChampionList({
  months,
  unitLabel,
  scopeLabel,
  metricLabel,
}: {
  months: MonthlyChampion[];
  unitLabel: string;
  scopeLabel: string;
  metricLabel: string;
}) {
  return (
    <details
      open
      className="mt-6 rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] group"
    >
      <summary className="list-none cursor-pointer select-none px-4 sm:px-6 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="text-[15px] sm:text-[16px] font-bold text-[#16191f] tracking-tight">
            지난 12개월 월별 1위
          </div>
          <div className="text-[11.5px] sm:text-[12.5px] text-[#5f6b7a] mt-0.5 truncate">
            {scopeLabel} · {metricLabel} 기준
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0972d3]">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
            className="transition-transform group-open:rotate-180"
          >
            <path
              d="M5 7.5l5 5 5-5"
              stroke="#0972d3"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>

      <div className="border-t border-[#eaeded] px-4 sm:px-6 py-4">
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {months.map((m) => {
            const c = m.champion;
            return (
              <li
                key={m.month}
                className="rounded-md ring-1 ring-[#eaeded] px-3 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#5f6b7a] tabular-nums">
                    {m.monthLabel}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5 flex-wrap min-w-0">
                    {c ? (
                      <>
                        <span className="text-[14px] font-bold text-[#16191f] truncate">
                          {c.maskedName}
                        </span>
                        <span className="text-[11px] text-[#5f6b7a] truncate">
                          {c.schoolName}
                        </span>
                      </>
                    ) : (
                      <span className="text-[12px] text-[#95a5b8]">기록 없음</span>
                    )}
                  </div>
                </div>
                {c && (
                  <div className="shrink-0 text-right">
                    <div className="text-[14px] font-bold tabular-nums text-[#ec7211] leading-tight">
                      {c.value.toLocaleString("ko-KR")}
                    </div>
                    <div className="text-[10px] text-[#95a5b8] leading-tight">
                      {unitLabel}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
