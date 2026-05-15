import { KpiCard } from "@/components/KpiCard";
import { MetricToggle } from "@/components/MetricToggle";
import { NavBar } from "@/components/NavBar";
import { PeriodToggle } from "@/components/PeriodToggle";
import { RankingTable } from "@/components/RankingTable";
import { SchoolSearch } from "@/components/SchoolSearch";
import { getMockDailyUsage, getMockSchools, getMockStudents } from "@/lib/mock";
import { computeKpi, computeRanking, type Metric, type Period } from "@/lib/ranking";

const PERIODS = new Set<Period>(["yesterday", "7d", "30d"]);
const METRICS = new Set<Metric>(["credits", "attendance"]);

function pick<T extends string>(
  v: string | string[] | undefined,
  allowed: Set<T>,
  fallback: T,
): T {
  const s = Array.isArray(v) ? v[0] : v;
  return s && allowed.has(s as T) ? (s as T) : fallback;
}

function fmtKstDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

export default async function PublicDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const period = pick(sp.period, PERIODS, "7d");
  const metric = pick(sp.metric, METRICS, "credits");
  const schoolParam = (Array.isArray(sp.school) ? sp.school[0] : sp.school) ?? "all";

  const now = new Date();
  const usage = getMockDailyUsage(30, now);
  const students = getMockStudents();
  const schools = getMockSchools();
  const school =
    schoolParam === "all" || schools.some((s) => s.id === schoolParam) ? schoolParam : "all";

  const kpi = computeKpi(usage, now);
  const rank = computeRanking(metric, usage, students, schools, period, school, 100, now);

  const otherParamsExceptMetric = { school, period };
  const otherParamsExceptPeriod = { school, metric };
  const otherParamsExceptSchool = { metric, period };

  const metricLabel = metric === "credits" ? "토큰 사용량" : "출석";
  const periodLabel =
    period === "yesterday" ? "어제" : period === "7d" ? "최근 7일" : "최근 30일";
  const scopeLabel =
    school === "all"
      ? "전체 학교"
      : schools.find((s) => s.id === school)?.name ?? "선택 학교";

  return (
    <div className="min-h-full" style={{ background: "#f4f5f7" }}>
      <NavBar />

      <main className="mx-auto max-w-5xl px-5 pt-8 pb-16 sm:px-6 sm:pt-10 lg:pt-12">
        <header className="mb-10 lg:mb-14 text-center">
          <p className="text-[14px] sm:text-[15px] font-bold tracking-wide text-[#3182f6] mb-3">
            AWS KIRO · 사용 현황
          </p>
          <h1 className="text-[36px] sm:text-[44px] lg:text-[56px] font-bold tracking-tight leading-[1.1] text-[#191f28]">
            학교 통합 랭킹
          </h1>
          <p className="mt-5 text-[15px] sm:text-[16px] text-[#4e5968]">
            <strong className="text-[#191f28]">{fmtKstDate(kpi.baseDate)}</strong> 기준
            <span className="ml-1.5 text-[#8b95a1]">· 매일 오전 11:30 갱신</span>
          </p>
          <p className="mt-2 text-[13px] text-[#b0b8c1]">
            현재 표시 값은 임시 목업입니다. 각 학교 Kiro 리포트 연결 시 실제 값으로 자동 전환.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-2.5 mb-6 sm:grid-cols-4 sm:gap-3 lg:mb-8">
          <KpiCard label="참여 학교" value={kpi.participatingSchools} unit="곳" accent />
          <KpiCard label="누적 사용 학생" value={kpi.cumulativeStudents} unit="명" />
          <KpiCard label="어제 활성 학생" value={kpi.activeYesterday} unit="명" />
          <KpiCard label="어제 총 크레딧" value={kpi.totalCreditsYesterday} unit="credit" />
        </section>

        <section className="rounded-2xl bg-white p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-[#f1f3f5]">
          {/* 헤더 행: lg에서 3균등 그리드(좌 타이틀 / 가운데 학교 검색 / 우 토글) */}
          <div className="flex flex-col gap-3 mb-5 lg:grid lg:grid-cols-3 lg:items-center">
            <div className="min-w-0 text-center lg:text-left">
              <h2 className="text-[16px] sm:text-[18px] font-bold text-[#191f28] tracking-tight truncate">
                {scopeLabel} · {metricLabel} 랭킹
              </h2>
              <p className="text-[11.5px] sm:text-[12.5px] text-[#8b95a1] mt-0.5">
                {periodLabel} 기준 · 상위 {rank.length}명
              </p>
            </div>

            {/* 가운데: 학교 드롭다운 */}
            <div className="flex justify-center min-w-0">
              <SchoolSearch
                schools={schools}
                value={school}
                otherParams={otherParamsExceptSchool}
              />
            </div>

            {/* 우측: 토글 */}
            <div className="flex items-center gap-2 justify-center lg:justify-end flex-wrap">
              <PeriodToggle
                paramKey="period"
                value={period}
                otherParams={otherParamsExceptPeriod}
              />
              <MetricToggle value={metric} otherParams={otherParamsExceptMetric} />
            </div>
          </div>

          <RankingTable rows={rank} unitLabel={metric === "credits" ? "credit" : "일"} />
        </section>

        <footer className="mt-10 text-center text-[11.5px] text-[#b0b8c1]">
          이름은 개인정보 보호를 위해 마스킹되어 표시됩니다 · powered by AWS Kiro
        </footer>
      </main>
    </div>
  );
}
