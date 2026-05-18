import type { RankRow } from "@/lib/types";

// 1~3위 트로피 컬러 (AWS 톤: 1위는 AWS 오렌지 강조)
const TROPHY: Record<number, { emoji: string; badge: string; text: string }> = {
  1: { emoji: "🥇", badge: "#ec7211", text: "#ffffff" },
  2: { emoji: "🥈", badge: "#879596", text: "#ffffff" },
  3: { emoji: "🥉", badge: "#a06a3f", text: "#ffffff" },
};

export function RankingTable({
  rows,
  unitLabel,
  emptyMessage = "아직 데이터가 없습니다.",
  scrollMaxHeight = "640px",
  highlightUserId,
}: {
  rows: RankRow[];
  unitLabel: string;
  emptyMessage?: string;
  scrollMaxHeight?: string;
  // 로그인한 학생 본인 행에 시각적 강조 (토스 블루 ring + 'YOU' 배지)
  highlightUserId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[#5f6b7a] py-10 text-center">{emptyMessage}</p>
    );
  }
  return (
    <div
      // ring-2 가 row 의 좌측 2px 바깥으로 그려져서, overflow 컨테이너가 좌측을 잘라먹음.
      // pl-1 (4px) 로 ring 이 그려질 공간 확보. 우측은 스크롤바 트릭(-mr-1) 유지.
      className="overflow-y-auto pl-1 pr-1 -mr-1 [scrollbar-width:thin] [scrollbar-color:#d5dbdb_transparent]"
      style={{ maxHeight: scrollMaxHeight }}
    >
      <ol className="space-y-1">
        {rows.map((r) => {
          const isFirst = r.rank === 1;
          const isMe = !!highlightUserId && r.userId === highlightUserId;
          const trophy = TROPHY[r.rank];
          // 1위 행은 패딩/폰트 더 크고, AWS 오렌지 톤으로 강조
          const baseCls = isFirst
            ? "grid grid-cols-3 items-center gap-3 sm:gap-5 px-3.5 py-5 sm:py-6 rounded-lg"
            : "grid grid-cols-3 items-center gap-2 sm:gap-4 px-2.5 py-2.5 rounded-md transition-colors hover:bg-[#f2f3f3]";
          // 본인 행: 1위 골드 위에는 블루 ring 만 덧대고, 일반 행은 옅은 블루 배경까지
          const meCls = isMe
            ? isFirst
              ? " ring-2 ring-[#0972d3]"
              : " bg-[#f2f8fd] ring-2 ring-[#0972d3] hover:bg-[#f2f8fd]"
            : "";
          const rowCls = baseCls + meCls;
          const rowStyle = isFirst
            ? {
                background:
                  "linear-gradient(135deg, #fef3eb 0%, #fde2cd 60%, #fbcfa9 100%)",
                boxShadow:
                  "inset 0 0 0 1.5px rgba(236,114,17,0.4), 0 2px 8px rgba(236,114,17,0.12)",
              }
            : undefined;

          return (
            <li key={r.userId} className={rowCls} style={rowStyle}>
              {/* col 1: 트로피/순위 + 이름 */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {trophy ? (
                  <span
                    className={
                      "inline-flex items-center justify-center rounded-full shrink-0 " +
                      (isFirst
                        ? "w-11 h-11 sm:w-12 sm:h-12 text-[22px]"
                        : "w-8 h-8 sm:w-9 sm:h-9 text-[16px]")
                    }
                    style={{ background: trophy.badge, color: trophy.text }}
                    aria-label={`${r.rank}위 트로피`}
                  >
                    {trophy.emoji}
                  </span>
                ) : (
                  <span
                    className="inline-flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full text-[12px] font-bold tabular-nums shrink-0 text-[#95a5b8]"
                    aria-label={`${r.rank}위`}
                  >
                    {r.rank}
                  </span>
                )}
                <div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className={
                      "font-bold tracking-tight truncate text-[#16191f] " +
                      (isFirst ? "text-[18px] sm:text-[22px]" : "text-[13.5px] sm:text-[14px] font-semibold")
                    }
                  >
                    {r.maskedName}
                  </span>
                  {isFirst && (
                    <span
                      className="hidden sm:inline text-[11px] font-extrabold px-2 py-0.5 rounded-md shrink-0"
                      style={{ background: "#ec7211", color: "#ffffff" }}
                    >
                      CHAMPION
                    </span>
                  )}
                  {isMe && (
                    <span
                      className="text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 bg-[#0972d3] text-white"
                      aria-label="본인"
                    >
                      YOU
                    </span>
                  )}
                </div>
              </div>

              {/* col 2: 조직명 (가운데) */}
              <div className="min-w-0 text-center">
                <span
                  className={
                    "truncate inline-block max-w-full " +
                    (isFirst
                      ? "text-[13px] sm:text-[14px] font-semibold text-[#7a3a00]"
                      : "text-[11.5px] sm:text-[12.5px] text-[#414d5c]")
                  }
                >
                  {r.schoolName}
                </span>
              </div>

              {/* col 3: 점수 (오른쪽) */}
              <div className="min-w-0 text-right">
                <div
                  className={
                    "font-bold tabular-nums leading-tight " +
                    (isFirst
                      ? "text-[#7a3a00] text-[22px] sm:text-[26px]"
                      : "text-[#16191f] text-[13.5px] sm:text-[14px]")
                  }
                >
                  {r.value.toLocaleString("ko-KR")}
                </div>
                <div
                  className={
                    "leading-tight mt-0.5 " +
                    (isFirst ? "text-[12px] text-[#a04a00] font-semibold" : "text-[10px] text-[#95a5b8]")
                  }
                >
                  {unitLabel}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
