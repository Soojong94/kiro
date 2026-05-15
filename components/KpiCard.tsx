export function KpiCard({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: number | string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-[#f1f3f5]">
      <div className="text-[11px] font-semibold text-[#8b95a1]">{label}</div>
      <div
        className={
          "mt-1 text-[22px] leading-tight font-bold tabular-nums " +
          (accent ? "text-[#3182f6]" : "text-[#191f28]")
        }
      >
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
        {unit && (
          <span className="ml-1 text-[13px] font-medium text-[#8b95a1]">{unit}</span>
        )}
      </div>
    </div>
  );
}
