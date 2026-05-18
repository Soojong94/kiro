import Link from "next/link";
import type { Period } from "@/lib/ranking";

const LABELS: Record<Period, string> = {
  yesterday: "어제",
  "7d": "7일",
  this_month: "이번달",
  last_month: "지난달",
  custom: "직접 입력",
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
    if (p !== "custom") {
      sp.delete("from");
      sp.delete("to");
    }
    return `/?${sp.toString()}`;
  };
  return (
    <div className="inline-flex rounded-md ring-1 ring-[#d5dbdb] bg-white overflow-hidden text-[13px] font-semibold">
      {(Object.keys(LABELS) as Period[]).map((p, i) => {
        const active = p === value;
        const isFirst = i === 0;
        return (
          <Link
            key={p}
            href={make(p)}
            scroll={false}
            className={
              "px-2.5 py-1.5 transition-colors whitespace-nowrap " +
              (isFirst ? "" : "border-l border-[#d5dbdb] ") +
              (active
                ? "bg-[#f2f8fd] text-[#033160]"
                : "text-[#414d5c] hover:bg-[#f2f3f3]")
            }
          >
            {LABELS[p]}
          </Link>
        );
      })}
    </div>
  );
}
