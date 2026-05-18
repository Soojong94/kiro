"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OrgComparisonRow } from "@/lib/ranking";

type AdminMetric = "credits" | "students" | "messages" | "avg";

const METRIC_CONFIG: Record<
  AdminMetric,
  { key: keyof OrgComparisonRow; label: string; unit: string; color: string }
> = {
  credits: {
    key: "totalCredits",
    label: "총 크레딧",
    unit: "credit",
    color: "#0972d3",
  },
  students: {
    key: "activeStudents",
    label: "활성 학생 수",
    unit: "명",
    color: "#ec7211",
  },
  messages: {
    key: "totalMessages",
    label: "총 메시지",
    unit: "건",
    color: "#2ea597",
  },
  avg: {
    key: "avgCreditsPerStudent",
    label: "1인당 평균 크레딧",
    unit: "credit",
    color: "#7d3cf3",
  },
};

export function OrgComparisonChart({
  rows,
  metric,
}: {
  rows: OrgComparisonRow[];
  metric: AdminMetric;
}) {
  const cfg = METRIC_CONFIG[metric];
  // 차트가 정렬되도록 metric 기준 내림차순으로 다시 정렬
  const sorted = [...rows].sort(
    (a, b) => (b[cfg.key] as number) - (a[cfg.key] as number),
  );

  return (
    <div className="w-full" style={{ height: 380 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid stroke="#eaeded" vertical={false} />
          <XAxis
            dataKey="schoolName"
            tick={{ fill: "#414d5c", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "#d5dbdb" }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: "#5f6b7a", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#d5dbdb" }}
            tickFormatter={(v: number) => v.toLocaleString("ko-KR")}
          />
          <Tooltip
            cursor={{ fill: "#f2f3f3" }}
            contentStyle={{
              border: "1px solid #d5dbdb",
              borderRadius: 6,
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(0,28,36,0.1)",
            }}
            formatter={(value) => {
              const v = typeof value === "number" ? value : Number(value);
              return [`${v.toLocaleString("ko-KR")} ${cfg.unit}`, cfg.label];
            }}
            labelStyle={{ color: "#16191f", fontWeight: 600, marginBottom: 4 }}
          />
          <Bar
            dataKey={cfg.key as string}
            fill={cfg.color}
            radius={[6, 6, 0, 0]}
            maxBarSize={64}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
