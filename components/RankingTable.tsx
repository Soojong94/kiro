import type { RankRow } from "@/lib/types";

// 1~3위 트로피 컬러
const TROPHY: Record<number, { emoji: string; badge: string; text: string }> = {
  1: { emoji: "🥇", badge: "#ffb020", text: "#ffffff" },
  2: { emoji: "🥈", badge: "#c0c6ce", text: "#ffffff" },
  3: { emoji: "🥉", badge: "#cd7f32", text: "#ffffff" },
};

export function RankingTable({
  rows,
  unitLabel,
  emptyMessage = "아직 데이터가 없습니다.",
  scrollMaxHeight = "640px",
}: {
  rows: RankRow[];
  unitLabel: string;
  emptyMessage?: string;
  scrollMaxHeight?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[#8b95a1] py-10 text-center">{emptyMessage}</p>
    );
  }
  return (
    <div
      className="overflow-y-auto pr-1 -mr-1 [scrollbar-width:thin] [scrollbar-color:#dbe1e8_transparent]"
      style={{ maxHeight: scrollMaxHeight }}
    >
      <ol className="space-y-1">
        {rows.map((r) => {
          const isFirst = r.rank === 1;
          const trophy = TROPHY[r.rank];
          // 1위 행은 패딩/폰트 더 크고, 골드 배경 + 그라데이션 보더로 확실히 강조
          const rowCls = isFirst
            ? "grid grid-cols-3 items-center gap-3 sm:gap-5 px-3.5 py-5 sm:py-6 rounded-2xl"
            : "grid grid-cols-3 items-center gap-2 sm:gap-4 px-2.5 py-2.5 rounded-lg transition-colors hover:bg-[#f4f5f7]";
          const rowStyle = isFirst
            ? {
                background:
                  "linear-gradient(135deg, #fff7e1 0%, #fff1c8 60%, #ffe39a 100%)",
                boxShadow:
                  "inset 0 0 0 1.5px rgba(255,176,32,0.45), 0 4px 14px rgba(255,176,32,0.18)",
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
                    className="inline-flex w-7 h-7 sm:w-8 sm:h-8 items-center justify-center rounded-full text-[12px] font-bold tabular-nums shrink-0 text-[#b0b8c1]"
                    aria-label={`${r.rank}위`}
                  >
                    {r.rank}
                  </span>
                )}
                <div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className={
                      "font-bold tracking-tight truncate text-[#191f28] " +
                      (isFirst ? "text-[18px] sm:text-[22px]" : "text-[13.5px] sm:text-[14px] font-semibold")
                    }
                  >
                    {r.maskedName}
                  </span>
                  {isFirst && (
                    <span
                      className="hidden sm:inline text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: "#ffb020", color: "#ffffff" }}
                    >
                      CHAMPION
                    </span>
                  )}
                </div>
              </div>

              {/* col 2: 학교명 (가운데) */}
              <div className="min-w-0 text-center">
                <span
                  className={
                    "truncate inline-block max-w-full " +
                    (isFirst
                      ? "text-[13px] sm:text-[14px] font-semibold text-[#7a4f00]"
                      : "text-[11.5px] sm:text-[12.5px] text-[#4e5968]")
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
                      ? "text-[#7a4f00] text-[22px] sm:text-[26px]"
                      : "text-[#191f28] text-[13.5px] sm:text-[14px]")
                  }
                >
                  {r.value.toLocaleString("ko-KR")}
                </div>
                <div
                  className={
                    "leading-tight mt-0.5 " +
                    (isFirst ? "text-[12px] text-[#a06a00] font-semibold" : "text-[10px] text-[#b0b8c1]")
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
