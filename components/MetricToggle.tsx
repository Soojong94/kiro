import Link from "next/link";
import type { Metric } from "@/lib/ranking";

const LABELS: Record<Metric, string> = {
  credits: "토큰 사용량",
  attendance: "출석",
};

export function MetricToggle({
  value,
  otherParams,
}: {
  value: Metric;
  otherParams: Record<string, string>;
}) {
  const make = (m: Metric) => {
    const sp = new URLSearchParams(otherParams);
    sp.set("metric", m);
    return `/?${sp.toString()}`;
  };
  return (
    <div className="inline-flex bg-[#f4f5f7] rounded-full p-1 text-[13px] font-semibold">
      {(Object.keys(LABELS) as Metric[]).map((m) => {
        const active = value === m;
        return (
          <Link
            key={m}
            href={make(m)}
            scroll={false}
            className={
              "px-3.5 py-1.5 rounded-full transition-colors " +
              (active
                ? "bg-[#191f28] text-white"
                : "text-[#8b95a1] hover:text-[#4e5968]")
            }
          >
            {LABELS[m]}
          </Link>
        );
      })}
    </div>
  );
}
