import Link from "next/link";
import type { Metric } from "@/lib/ranking";

const LABELS: Record<Metric, string> = {
  credits: "토큰 사용량",
  attendance: "출석",
};

// 메트릭별 active 색 — 시각적 구분 (헷갈림 방지).
const ACTIVE_BG: Record<Metric, string> = {
  credits: "#ec7211",   // AWS 오렌지 — 1위/credit 톤과 일관
  attendance: "#0972d3", // AWS 블루 — 출석/카운트 톤
};

export function MetricToggle({
  value,
  otherParams,
  basePath = "/",
}: {
  value: Metric;
  otherParams: Record<string, string>;
  basePath?: string;
}) {
  const make = (m: Metric) => {
    const sp = new URLSearchParams(otherParams);
    sp.set("metric", m);
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="inline-flex rounded-md ring-1 ring-[#d5dbdb] bg-white overflow-hidden text-[13px] font-semibold">
      {(Object.keys(LABELS) as Metric[]).map((m, i) => {
        const active = value === m;
        const isFirst = i === 0;
        return (
          <Link
            key={m}
            href={make(m)}
            scroll={false}
            style={active ? { background: ACTIVE_BG[m] } : undefined}
            className={
              "px-3 py-1.5 transition-colors cursor-pointer " +
              (isFirst ? "" : "border-l border-[#d5dbdb] ") +
              (active
                ? "text-white"
                : "text-[#414d5c] hover:bg-[#f2f3f3]")
            }
          >
            {LABELS[m]}
          </Link>
        );
      })}
    </div>
  );
}
