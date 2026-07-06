import Link from "next/link";
import { PrintButton } from "@/components/admin/PrintButton";
import { requireAdmin } from "@/lib/auth";
import {
  loadReportSchoolOptions,
  loadUsageReport,
  reportWindow,
  type BreakdownRow,
  type ReportPeriodPreset,
  type StudentReportRow,
} from "@/lib/report";

export const metadata = {
  title: "사용 보고서 · Kiro 관리자",
};

const PERIODS: { value: ReportPeriodPreset; label: string }[] = [
  { value: "this_month", label: "이번 달" },
  { value: "7d", label: "최근 7일" },
  { value: "last_month", label: "지난 달" },
  { value: "custom", label: "기간 지정" },
];

function pickPreset(value: string | string[] | undefined): ReportPeriodPreset {
  const v = Array.isArray(value) ? value[0] : value;
  return PERIODS.some((p) => p.value === v) ? (v as ReportPeriodPreset) : "this_month";
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function fmtDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${y}.${m}.${d}`;
}

function fmtNumber(value: number, digits = 0): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const preset = pickPreset(sp.period);
  const selectedSchoolParam = single(sp.school);
  const fromParam = single(sp.from);
  const toParam = single(sp.to);
  const window = reportWindow(preset, new Date(), {
    from: fromParam,
    to: toParam,
  });

  const scopedSchoolId = admin.role === "school" ? admin.schoolId : selectedSchoolParam;
  const schools = await loadReportSchoolOptions({
    includeInternal: admin.role === "super",
    schoolId: admin.role === "school" ? admin.schoolId : null,
  });
  const selectedSchoolId =
    scopedSchoolId && schools.some((s) => s.id === scopedSchoolId)
      ? scopedSchoolId
      : "";

  const report = await loadUsageReport({
    from: window.from,
    to: window.to,
    schoolId: selectedSchoolId || null,
    includeInternal: admin.role === "super",
  });

  const totals = report.schools.reduce(
    (acc, row) => ({
      registeredStudents: acc.registeredStudents + row.registeredStudents,
      activeStudents: acc.activeStudents + row.activeStudents,
      totalMessages: acc.totalMessages + row.totalMessages,
      totalConversations: acc.totalConversations + row.totalConversations,
      totalCredits: acc.totalCredits + row.totalCredits,
      overageCredits: acc.overageCredits + row.overageCredits,
    }),
    {
      registeredStudents: 0,
      activeStudents: 0,
      totalMessages: 0,
      totalConversations: 0,
      totalCredits: 0,
      overageCredits: 0,
    },
  );
  const activeRate =
    totals.registeredStudents > 0
      ? Math.round((totals.activeStudents / totals.registeredStudents) * 1000) / 10
      : 0;

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8 lg:py-10 print:max-w-none print:px-0 print:py-0">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between print:mb-4">
        <div>
          <p className="text-[12px] font-bold text-[#ec7211] print:text-[#414d5c]">
            Kiro Usage Report
          </p>
          <h1 className="mt-1 text-[24px] sm:text-[28px] font-bold tracking-tight text-[#16191f]">
            학교별 사용 보고서
          </h1>
          <p className="mt-1.5 text-[13px] text-[#5f6b7a]">
            {fmtDate(report.window.from)} ~ {fmtDate(report.window.to)} 기준
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Link
            href="/admin"
            className="px-3 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3]"
          >
            대시보드
          </Link>
        </div>
      </header>

      <form
        method="get"
        className="mb-6 rounded-lg bg-white p-4 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:hidden"
      >
        <div className="grid gap-3 md:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#414d5c]">기간</span>
            <select
              name="period"
              defaultValue={preset}
              className="w-full rounded-md bg-white px-2.5 py-2 text-[13px] ring-1 ring-[#d5dbdb] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#414d5c]">학교</span>
            <select
              name="school"
              defaultValue={selectedSchoolId}
              disabled={admin.role === "school"}
              className="w-full rounded-md bg-white px-2.5 py-2 text-[13px] ring-1 ring-[#d5dbdb] disabled:bg-[#f2f3f3] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            >
              {admin.role === "super" && <option value="">전체 학교</option>}
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isInternal ? " (사내)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#414d5c]">시작일</span>
            <input
              type="date"
              name="from"
              defaultValue={window.from}
              className="w-full rounded-md bg-white px-2.5 py-2 text-[13px] ring-1 ring-[#d5dbdb] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#414d5c]">종료일</span>
            <input
              type="date"
              name="to"
              defaultValue={window.to}
              className="w-full rounded-md bg-white px-2.5 py-2 text-[13px] ring-1 ring-[#d5dbdb] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
          </label>

          <button
            type="submit"
            className="rounded-md bg-[#0972d3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#033160] cursor-pointer"
          >
            보고서 생성
          </button>
        </div>
      </form>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4 print:gap-2">
        <MetricCard label="등록 학생" value={fmtNumber(totals.registeredStudents)} unit="명" />
        <MetricCard label="활성 학생" value={fmtNumber(totals.activeStudents)} unit={`명 · ${activeRate}%`} />
        <MetricCard label="총 크레딧" value={fmtNumber(totals.totalCredits, 1)} unit="credit" />
        <MetricCard label="총 메시지" value={fmtNumber(totals.totalMessages)} unit="건" />
      </section>

      <section className="mt-6 rounded-lg bg-white p-4 sm:p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:mt-4 print:break-inside-avoid print:shadow-none">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold text-[#16191f]">학교별 요약</h2>
            <p className="mt-0.5 text-[12px] text-[#5f6b7a]">
              크레딧 사용량 내림차순
            </p>
          </div>
          <span className="text-[12px] text-[#5f6b7a]">{report.schools.length}곳</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="border-y border-[#eaeded] bg-[#fafafa] text-[11.5px] text-[#5f6b7a]">
              <tr>
                <Th>학교</Th>
                <Th align="right">등록</Th>
                <Th align="right">활성</Th>
                <Th align="right">활성률</Th>
                <Th align="right">메시지</Th>
                <Th align="right">대화</Th>
                <Th align="right">크레딧</Th>
                <Th align="right">1인 평균</Th>
              </tr>
            </thead>
            <tbody>
              {report.schools.map((row) => (
                <tr key={row.schoolId} className="border-b border-[#f4f5f6] last:border-0">
                  <Td>
                    <div className="font-semibold text-[#16191f]">{row.schoolName}</div>
                    {row.isInternal && (
                      <div className="mt-0.5 text-[10.5px] font-bold text-[#ec7211]">사내</div>
                    )}
                  </Td>
                  <Td align="right">{fmtNumber(row.registeredStudents)}</Td>
                  <Td align="right">{fmtNumber(row.activeStudents)}</Td>
                  <Td align="right">{fmtNumber(row.activeRate, 1)}%</Td>
                  <Td align="right">{fmtNumber(row.totalMessages)}</Td>
                  <Td align="right">{fmtNumber(row.totalConversations)}</Td>
                  <Td align="right">{fmtNumber(row.totalCredits, 1)}</Td>
                  <Td align="right">{fmtNumber(row.avgCreditsPerActiveStudent, 1)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.detail ? (
        <SchoolDetail report={report.detail} />
      ) : (
        <section className="mt-6 rounded-lg bg-white p-5 ring-1 ring-[#eaeded] text-[13px] text-[#5f6b7a] print:hidden">
          학교를 하나 선택하면 일자별 추이, 클라이언트/모델 비중, 학생별 상위 사용자를 함께 볼 수 있습니다.
        </section>
      )}
    </main>
  );
}

function SchoolDetail({
  report,
}: {
  report: NonNullable<Awaited<ReturnType<typeof loadUsageReport>>["detail"]>;
}) {
  const maxDailyCredits = Math.max(...report.daily.map((d) => d.totalCredits), 0);

  return (
    <section className="mt-6 grid gap-6 print:gap-4">
      <div className="rounded-lg bg-white p-4 sm:p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:break-inside-avoid print:shadow-none">
        <h2 className="text-[17px] font-bold text-[#16191f]">{report.schoolName} 상세</h2>
        <p className="mt-0.5 text-[12px] text-[#5f6b7a]">일자별 활성 학생과 크레딧 추이</p>
        <div className="mt-4 grid gap-2">
          {report.daily.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#5f6b7a]">선택한 기간의 사용량이 없습니다.</p>
          ) : (
            report.daily.map((row) => (
              <div key={row.date} className="grid grid-cols-[86px_1fr_88px] items-center gap-3 text-[12px]">
                <span className="font-mono text-[#5f6b7a]">{row.date.slice(5)}</span>
                <div className="h-6 rounded bg-[#f2f3f3]">
                  <div
                    className="h-6 rounded bg-[#0972d3]"
                    style={{
                      width: `${maxDailyCredits > 0 ? Math.max((row.totalCredits / maxDailyCredits) * 100, 2) : 0}%`,
                    }}
                  />
                </div>
                <span className="text-right tabular-nums text-[#414d5c]">
                  {fmtNumber(row.totalCredits, 1)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        <BreakdownCard title="클라이언트별 크레딧" rows={report.clients} unit="credit" />
        <BreakdownCard title="모델별 메시지" rows={report.models} unit="건" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        <StudentTable title="크레딧 상위 학생" rows={report.topCredits} metric="credits" />
        <StudentTable title="출석일 상위 학생" rows={report.topAttendance} metric="days" />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-lg bg-white p-3.5 sm:p-4 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:shadow-none">
      <div className="text-[11.5px] font-semibold text-[#5f6b7a]">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1">
        <span className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f] tabular-nums">
          {value}
        </span>
        <span className="text-[12px] text-[#5f6b7a]">{unit}</span>
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  unit,
}: {
  title: string;
  rows: BreakdownRow[];
  unit: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);

  return (
    <div className="rounded-lg bg-white p-4 sm:p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:break-inside-avoid print:shadow-none">
      <h3 className="text-[15px] font-bold text-[#16191f]">{title}</h3>
      <div className="mt-4 grid gap-3">
        {rows.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[#5f6b7a]">데이터 없음</p>
        ) : (
          rows.map((row) => (
            <div key={row.label} className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="font-semibold text-[#414d5c]">{row.label}</span>
                <span className="tabular-nums text-[#5f6b7a]">
                  {fmtNumber(row.value, 1)} {unit} · {fmtNumber(row.share, 1)}%
                </span>
              </div>
              <div className="h-2 rounded bg-[#f2f3f3]">
                <div
                  className="h-2 rounded bg-[#ec7211]"
                  style={{ width: `${max > 0 ? Math.max((row.value / max) * 100, 2) : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StudentTable({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: StudentReportRow[];
  metric: "credits" | "days";
}) {
  return (
    <div className="rounded-lg bg-white p-4 sm:p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] print:break-inside-avoid print:shadow-none">
      <h3 className="text-[15px] font-bold text-[#16191f]">{title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="border-y border-[#eaeded] bg-[#fafafa] text-[11.5px] text-[#5f6b7a]">
            <tr>
              <Th>학생</Th>
              <Th align="right">{metric === "credits" ? "크레딧" : "출석일"}</Th>
              <Th align="right">메시지</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={3}>데이터 없음</Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.userId} className="border-b border-[#f4f5f6] last:border-0">
                  <Td>{row.maskedName}</Td>
                  <Td align="right">
                    {metric === "credits" ? fmtNumber(row.totalCredits, 1) : fmtNumber(row.activeDays)}
                  </Td>
                  <Td align="right">{fmtNumber(row.totalMessages)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-2 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2 align-middle text-[#414d5c] whitespace-nowrap ${align === "right" ? "text-right tabular-nums" : "text-left"}`}
    >
      {children}
    </td>
  );
}
