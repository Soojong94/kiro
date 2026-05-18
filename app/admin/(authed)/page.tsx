import Link from "next/link";
import { OrgComparisonChart } from "@/components/admin/OrgComparisonChart";
import { requireAdmin } from "@/lib/auth";
import { loadDailyUsage, loadSchools } from "@/lib/db-data";
import {
  computeOrgComparison,
  periodWindow,
  type Period,
} from "@/lib/ranking";

type AdminMetric = "credits" | "students" | "messages" | "avg";

const PERIODS: Period[] = ["yesterday", "7d", "this_month", "last_month"];
const METRICS: AdminMetric[] = ["credits", "students", "messages", "avg"];

const PERIOD_LABEL: Record<Period, string> = {
  yesterday: "어제",
  "7d": "최근 7일",
  this_month: "이번 달",
  last_month: "지난 달",
  custom: "사용자 지정",
};

const METRIC_LABEL: Record<AdminMetric, string> = {
  credits: "총 크레딧",
  students: "활성 학생 수",
  messages: "총 메시지",
  avg: "1인당 평균 크레딧",
};

const METRIC_UNIT: Record<AdminMetric, string> = {
  credits: "credit",
  students: "명",
  messages: "건",
  avg: "credit",
};

function pickEnum<T extends string>(
  v: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const s = Array.isArray(v) ? v[0] : v;
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function fmtKstDate(s: string): string {
  const [y, m, d] = s.split("-");
  return `${y}.${m}.${d}`;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const period = pickEnum<Period>(sp.period, PERIODS, "this_month");
  const metric = pickEnum<AdminMetric>(sp.metric, METRICS, "credits");
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const kindFilter = (Array.isArray(sp.kind) ? sp.kind[0] : sp.kind) ?? "";
  const isFiltered = !!q || !!kindFilter;

  const now = new Date();
  const [usage, allSchools] = await Promise.all([
    loadDailyUsage(60),
    loadSchools(),
  ]);
  // 학교 어드민은 본교만 (필터 무시). super 는 검색/구분 필터 적용.
  let schools = allSchools;
  if (admin.role === "school") {
    schools = allSchools.filter((s) => s.id === admin.schoolId);
  } else {
    if (q) {
      const qLower = q.toLowerCase();
      schools = schools.filter(
        (s) => s.id.includes(qLower) || s.name.toLowerCase().includes(qLower),
      );
    }
    if (kindFilter) {
      schools = schools.filter((s) => s.kind === kindFilter);
    }
  }

  const rows = computeOrgComparison(usage, schools, period, now);
  const window = periodWindow(period, now);

  // 합계/요약
  const totals = rows.reduce(
    (acc, r) => ({
      credits: acc.credits + r.totalCredits,
      students: acc.students + r.activeStudents,
      messages: acc.messages + r.totalMessages,
    }),
    { credits: 0, students: 0, messages: 0 },
  );

  const makeUrl = (params: Partial<{ period: Period; metric: AdminMetric }>) => {
    const u = new URLSearchParams({ period, metric, ...params });
    if (q) u.set("q", q);
    if (kindFilter) u.set("kind", kindFilter);
    return `/admin?${u.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8 lg:py-10">
      <header className="mb-8">
        <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#16191f]">
          {admin.role === "super" ? "조직별 사용 현황 비교" : `${schools[0]?.name ?? admin.schoolId} 사용 현황`}
        </h1>
        <p className="mt-1.5 text-[13px] text-[#5f6b7a]">
          {fmtKstDate(window.from)} ~ {fmtKstDate(window.to)} 기준 ·{" "}
          {admin.role === "super" ? "모든 등록 조직" : "본교만"}
        </p>
      </header>

      {/* 요약 카드 */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-6">
        <SummaryCard label="등록 조직" value={rows.length} unit="곳" />
        <SummaryCard label="활성 학생" value={totals.students} unit="명" />
        <SummaryCard
          label="총 크레딧"
          value={Math.round(totals.credits)}
          unit="credit"
        />
        <SummaryCard label="총 메시지" value={totals.messages} unit="건" />
      </section>

      <section className="rounded-lg bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,28,36,0.05)] ring-1 ring-[#eaeded]">
        {/* 필터 */}
        <div className="flex flex-col gap-3 mb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[16px] sm:text-[18px] font-bold text-[#16191f]">
              {METRIC_LABEL[metric]}
            </h2>
            <p className="text-[12px] text-[#5f6b7a] mt-0.5">
              {PERIOD_LABEL[period]} · 단위 {METRIC_UNIT[metric]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              items={PERIODS.map((p) => ({
                value: p,
                label: PERIOD_LABEL[p],
                href: makeUrl({ period: p }),
                active: p === period,
              }))}
            />
            <ToggleGroup
              items={METRICS.map((m) => ({
                value: m,
                label: METRIC_LABEL[m],
                href: makeUrl({ metric: m }),
                active: m === metric,
                accent: true,
              }))}
            />
          </div>
        </div>

        {/* 학교 검색/필터 — super 만 노출 */}
        {admin.role === "super" && (
          <form
            method="get"
            className="mb-4 flex items-center gap-2 flex-wrap text-[12.5px]"
          >
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="metric" value={metric} />
            <input
              type="text"
              name="q"
              placeholder="조직 검색 (id/이름)"
              defaultValue={q}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white w-48 focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
            <select
              name="kind"
              defaultValue={kindFilter}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white"
            >
              <option value="">전체 구분</option>
              <option value="university">대학교</option>
              <option value="high_school">고등학교</option>
              <option value="region">권역/기타</option>
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md bg-[#232f3e] text-white font-semibold hover:bg-[#161e2d] cursor-pointer"
            >
              검색
            </button>
            {isFiltered && (
              <a
                href={`/admin?period=${period}&metric=${metric}`}
                className="px-3 py-1.5 rounded-md bg-white ring-1 ring-[#d5dbdb] font-semibold text-[#5f6b7a] hover:bg-[#f2f3f3] cursor-pointer"
              >
                초기화
              </a>
            )}
            {isFiltered && (
              <span className="text-[11.5px] text-[#5f6b7a] ml-1">
                {schools.length}개 조직 표시 중
              </span>
            )}
          </form>
        )}

        {rows.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-[#5f6b7a]">
            조건에 맞는 조직이 없습니다.
          </div>
        ) : (
          <OrgComparisonChart rows={rows} metric={metric} />
        )}

        {/* 데이터 테이블 */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-[#5f6b7a] border-b border-[#eaeded]">
                <th className="py-2 pr-3 font-semibold">조직</th>
                <th className="py-2 px-3 font-semibold text-right">활성 학생</th>
                <th className="py-2 px-3 font-semibold text-right">총 크레딧</th>
                <th className="py-2 px-3 font-semibold text-right">1인당 평균</th>
                <th className="py-2 pl-3 font-semibold text-right">총 메시지</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.schoolId}
                  className="border-b border-[#f4f5f6] last:border-0"
                >
                  <td className="py-2.5 pr-3 font-semibold text-[#16191f]">
                    {r.schoolName}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-[#414d5c]">
                    {r.activeStudents.toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-[#414d5c]">
                    {r.totalCredits.toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-[#414d5c]">
                    {r.avgCreditsPerStudent.toLocaleString("ko-KR")}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-[#414d5c]">
                    {r.totalMessages.toLocaleString("ko-KR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-8 text-center text-[11.5px] text-[#95a5b8]">
        실제 데이터는 인제스트 이후 자동 반영 — 현재는 목업
      </footer>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-[#eaeded] p-3.5 sm:p-4 shadow-[0_1px_2px_rgba(0,28,36,0.05)]">
      <div className="text-[11.5px] text-[#5f6b7a] font-semibold">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] sm:text-[26px] font-bold text-[#16191f] tabular-nums tracking-tight">
          {value.toLocaleString("ko-KR")}
        </span>
        <span className="text-[12px] text-[#5f6b7a]">{unit}</span>
      </div>
    </div>
  );
}

function ToggleGroup({
  items,
}: {
  items: { value: string; label: string; href: string; active: boolean; accent?: boolean }[];
}) {
  return (
    <div className="inline-flex rounded-md ring-1 ring-[#d5dbdb] bg-white overflow-hidden text-[12.5px] font-semibold">
      {items.map((it, i) => (
        <Link
          key={it.value}
          href={it.href}
          scroll={false}
          className={
            "px-2.5 py-1.5 transition-colors whitespace-nowrap " +
            (i === 0 ? "" : "border-l border-[#d5dbdb] ") +
            (it.active
              ? it.accent
                ? "bg-[#232f3e] text-white"
                : "bg-[#f2f8fd] text-[#033160]"
              : "text-[#414d5c] hover:bg-[#f2f3f3]")
          }
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
