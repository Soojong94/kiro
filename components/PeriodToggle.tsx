import Link from "next/link";
import type { Period } from "@/lib/ranking";

const LABELS: Record<Period, string> = {
  yesterday: "어제",
  "7d": "최근 7일",
  "30d": "최근 30일",
};

export function PeriodToggle({
  paramKey,
  value,
  otherParams,
}: {
  paramKey: string;
  value: Period;
  otherParams: Record<string, string>;
}) {
  const make = (p: Period) => {
    const sp = new URLSearchParams(otherParams);
    sp.set(paramKey, p);
    return `/?${sp.toString()}`;
  };
  return (
    <div className="inline-flex bg-[#f4f5f7] rounded-full p-1 text-[13px] font-semibold">
      {(Object.keys(LABELS) as Period[]).map((p) => {
        const active = p === value;
        return (
          <Link
            key={p}
            href={make(p)}
            scroll={false}
            className={
              "px-3.5 py-1.5 rounded-full transition-colors " +
              (active
                ? "bg-white text-[#191f28] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-[#8b95a1] hover:text-[#4e5968]")
            }
          >
            {LABELS[p]}
          </Link>
        );
      })}
    </div>
  );
}
