import Link from "next/link";
import type { School } from "@/lib/types";
import type { SchoolPeriodStats } from "@/lib/ranking";

// 학교를 가로 카드로 펼친 필터. 각 카드에 해당 기간의 활성 학생 수 + 총 크레딧 미니 통계.
// 첫 카드는 "전체" 통합. 모바일에서는 가로 스크롤, lg부터 grid로 정렬.
export function SchoolStrip({
  schools,
  stats,
  value,                // "all" 또는 school id
  otherParams,
  totals,               // 전체 합산
}: {
  schools: School[];
  stats: Map<string, SchoolPeriodStats>;
  value: string;
  otherParams: Record<string, string>;
  totals: { activeStudents: number; totalCredits: number };
}) {
  const make = (v: string) => {
    const sp = new URLSearchParams(otherParams);
    sp.set("school", v);
    return `/?${sp.toString()}`;
  };

  return (
    <div
      className="grid gap-2 sm:gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${schools.length + 1}, minmax(0, 1fr))`,
      }}
    >
      <Card
        href={make("all")}
        active={value === "all"}
        title="전체"
        subtitle={`${schools.length}개교`}
        primary={totals.activeStudents}
        primaryUnit="명 활성"
        secondary={totals.totalCredits}
        secondaryUnit="credit"
      />
      {schools.map((s) => {
        const st = stats.get(s.id);
        return (
          <Card
            key={s.id}
            href={make(s.id)}
            active={value === s.id}
            title={s.name}
            subtitle={s.kind === "university" ? "대학교" : "고등학교"}
            primary={st?.activeStudents ?? 0}
            primaryUnit="명 활성"
            secondary={st?.totalCredits ?? 0}
            secondaryUnit="credit"
          />
        );
      })}
    </div>
  );
}

function Card({
  href,
  active,
  title,
  subtitle,
  primary,
  primaryUnit,
  secondary,
  secondaryUnit,
}: {
  href: string;
  active: boolean;
  title: string;
  subtitle: string;
  primary: number;
  primaryUnit: string;
  secondary: number;
  secondaryUnit: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="block rounded-xl px-3 py-3 transition-all"
      style={
        active
          ? {
              background: "#e8f3ff",
              boxShadow: "inset 0 0 0 1.5px #3182f6",
            }
          : { background: "#f4f5f7" }
      }
    >
      <div
        className="text-[12px] sm:text-[13px] font-bold tracking-tight truncate"
        style={{ color: active ? "#1b64da" : "#191f28" }}
      >
        {title}
      </div>
      <div
        className="text-[10px] mt-0.5"
        style={{ color: active ? "#3182f6" : "#b0b8c1" }}
      >
        {subtitle}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1">
        <span
          className="text-[16px] sm:text-[18px] font-bold tabular-nums leading-none"
          style={{ color: active ? "#1b64da" : "#191f28" }}
        >
          {primary.toLocaleString("ko-KR")}
        </span>
        <span className="text-[10px]" style={{ color: "#8b95a1" }}>
          {primaryUnit}
        </span>
      </div>
      <div className="mt-1 text-[10.5px] tabular-nums truncate" style={{ color: "#8b95a1" }}>
        {secondary.toLocaleString("ko-KR")} {secondaryUnit}
      </div>
    </Link>
  );
}
