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
    <div className="rounded-lg bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(0,28,36,0.05)] ring-1 ring-[#eaeded]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5f6b7a]">
        {label}
      </div>
      <div
        className={
          "mt-1 text-[22px] leading-tight font-bold tabular-nums " +
          (accent ? "text-[#0972d3]" : "text-[#16191f]")
        }
      >
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
        {unit && (
          <span className="ml-1 text-[13px] font-medium text-[#5f6b7a]">{unit}</span>
        )}
      </div>
    </div>
  );
}
