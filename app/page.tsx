import { DateRangePicker } from "@/components/DateRangePicker";
import { LoginGateCard } from "@/components/LoginGateCard";
import { MetricToggle } from "@/components/MetricToggle";
import { MyRankCard } from "@/components/MyRankCard";
import { NavBar } from "@/components/NavBar";
import { PeriodToggle } from "@/components/PeriodToggle";
import { RankingTable } from "@/components/RankingTable";
import { SchoolSearch } from "@/components/SchoolSearch";
import { loadDailyUsage, loadSchools, loadStudents } from "@/lib/db-data";
import {
  computeRanking,
  periodWindow,
  type Metric,
  type Period,
} from "@/lib/ranking";
import { requireActiveStudent } from "@/lib/student-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const PERIODS = new Set<Period>(["yesterday", "7d", "this_month", "last_month", "custom"]);
const METRICS = new Set<Metric>(["credits", "attendance"]);

// YYYY-MM-DD 정규식. 잘못된 입력 들어오면 무시.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pick<T extends string>(
  v: string | string[] | undefined,
  allowed: Set<T>,
  fallback: T,
): T {
  const s = Array.isArray(v) ? v[0] : v;
  return s && allowed.has(s as T) ? (s as T) : fallback;
}

function pickStr(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

function fmtKstDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function fmtRange(from: string, to: string): string {
  if (from === to) return fmtKstDate(from);
  return `${fmtKstDate(from)} ~ ${fmtKstDate(to)}`;
}

export default async function PublicDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ── 학생 세션 게이트 ───────────────────────────────────────────────
  const studentSession = await requireActiveStudent();
  const loggedIn = !!studentSession.userId;
  if (loggedIn && studentSession.mustChangePassword) {
    redirect("/change-password");
  }

  const sp = await searchParams;
  const period = pick(sp.period, PERIODS, "this_month");
  const metric = pick(sp.metric, METRICS, "credits");
  const schoolRaw = Array.isArray(sp.school) ? sp.school[0] : sp.school;

  const fromRaw = pickStr(sp.from);
  const toRaw = pickStr(sp.to);
  const fromValid = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : undefined;
  const toValid = toRaw && DATE_RE.test(toRaw) ? toRaw : undefined;
  const custom =
    period === "custom" && fromValid && toValid
      ? { from: fromValid, to: toValid }
      : undefined;

  const now = new Date();
  const [usage, students, allSchools] = await Promise.all([
    loadDailyUsage(30),
    loadStudents(),
    loadSchools({ includeInternal: true }), // 본교 필터/매핑용으로 사내도 일단 다 받아옴
  ]);
  // 드롭다운에 보일 학교 = 사내 제외
  const schools = allSchools.filter((s) => !s.isInternal);
  // 사내 학교 id 목록 — '전체 조직' 뷰에서 이들 학생 사용량 제외
  const internalIds = new Set(
    allSchools.filter((s) => s.isInternal).map((s) => s.id),
  );
  // 로그인 학생의 본교가 디폴트. 사내 학교 학생은 '전체 조직' 디폴트.
  const defaultSchool =
    loggedIn && studentSession.schoolId && !internalIds.has(studentSession.schoolId)
      ? studentSession.schoolId
      : "all";
  const schoolParam = schoolRaw ?? defaultSchool;
  // 사내 학교(TBIT) 는 어떤 경로로도 학생 페이지 랭킹에 노출 X — URL 직접 입력도 차단.
  const school =
    schoolParam === "all" ||
    (allSchools.some((s) => s.id === schoolParam) && !internalIds.has(schoolParam))
      ? schoolParam
      : "all";

  const baseDate = periodWindow("yesterday", now).to;
  const dateRange = periodWindow(period, now, custom);
  // '전체 조직' 뷰에선 사내 학교 사용량 제외 — 특정 학교 선택 시엔 그 학교 데이터 그대로.
  const usageForRank =
    school === "all"
      ? usage.filter((r) => !internalIds.has(r.schoolId))
      : usage;
  const rank = computeRanking(
    metric,
    usageForRank,
    students,
    allSchools,
    period,
    school,
    100,
    now,
    custom,
  );
  // 본인 순위 핀 카드 — 현재 필터 결과에 본인이 들어있을 때만 노출
  const myRow = loggedIn && studentSession.userId
    ? rank.find((r) => r.userId === studentSession.userId)
    : undefined;

  const otherParamsExceptMetric = { school, period, ...(fromValid ? { from: fromValid } : {}), ...(toValid ? { to: toValid } : {}) };
  const otherParamsExceptPeriod = { school, metric };
  const otherParamsExceptSchool = { metric, period, ...(fromValid ? { from: fromValid } : {}), ...(toValid ? { to: toValid } : {}) };
  const otherParamsForDate = { school, metric };

  const metricLabel = metric === "credits" ? "토큰 사용량" : "출석";
  const periodLabel =
    period === "yesterday"
      ? "어제"
      : period === "7d"
        ? "최근 7일"
        : period === "this_month"
          ? "이번 달"
          : period === "last_month"
            ? "지난 달"
            : custom
              ? fmtRange(dateRange.from, dateRange.to)
              : "사용자 지정";
  const scopeLabel =
    school === "all"
      ? "전체 조직"
      : allSchools.find((s) => s.id === school)?.name ?? "선택 조직";

  const pickerFrom = fromValid ?? dateRange.from;
  const pickerTo = toValid ?? dateRange.to;
  const yesterdayStr = periodWindow("yesterday", now).to;

  return (
    <div className="min-h-full" style={{ background: "#fafafa" }}>
      <NavBar />

      <main className="mx-auto max-w-5xl px-5 pt-8 pb-16 sm:px-6 sm:pt-10 lg:pt-12">
        <header className="mb-10 lg:mb-14">
          {loggedIn && (
            <div className="flex justify-end mb-4">
              <Link
                href="/champions"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#232f3e] text-white text-[13px] font-semibold hover:bg-[#161e2d] transition-colors"
              >
                🏆 월별 챔피언
              </Link>
            </div>
          )}
          <div className="text-center">
            <h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold tracking-tight leading-[1.15] text-[#16191f]">
              AWS KIRO · 사용량 통합랭킹
            </h1>
            <p className="mt-5 text-[15px] sm:text-[16px] text-[#414d5c]">
              <strong className="text-[#16191f]">{fmtKstDate(baseDate)}</strong> 기준
              <span className="ml-1.5 text-[#5f6b7a]">· 한국시간 매일 정오 12:00 갱신</span>
            </p>
          </div>
        </header>

        {!loggedIn ? (
          <LoginGateCard message="랭킹을 보려면 로그인이 필요합니다." />
        ) : (
        <>
        <section className="rounded-lg bg-white p-4 sm:p-6 shadow-[0_1px_2px_rgba(0,28,36,0.05)] ring-1 ring-[#eaeded]">
          {/* 헤더 행: lg에서 3균등 그리드(좌 타이틀 / 가운데 조직 검색 / 우 토글) */}
          <div className="flex flex-col gap-3 mb-3 lg:grid lg:grid-cols-3 lg:items-center">
            <div className="min-w-0 text-center lg:text-left">
              <h2 className="text-[16px] sm:text-[18px] font-bold text-[#16191f] tracking-tight truncate">
                {scopeLabel} · {metricLabel} 랭킹
              </h2>
              <p className="text-[11.5px] sm:text-[12.5px] text-[#5f6b7a] mt-0.5 truncate">
                {periodLabel} 기준 · 상위 {rank.length}명
              </p>
            </div>

            {/* 가운데: 조직 드롭다운 */}
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

          {/* period=custom 일 때만 달력 입력 노출 */}
          {period === "custom" && (
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end p-3 rounded-md bg-[#f2f8fd] ring-1 ring-[#d5dbdb]">
              <span className="text-[12px] font-semibold text-[#033160] sm:mr-1">
                기간 선택
              </span>
              <DateRangePicker
                from={pickerFrom}
                to={pickerTo}
                maxDate={yesterdayStr}
                otherParams={otherParamsForDate}
              />
            </div>
          )}

          {myRow && (
            <MyRankCard row={myRow} unitLabel={metric === "credits" ? "credit" : "일"} />
          )}

          <RankingTable
            rows={rank}
            unitLabel={metric === "credits" ? "credit" : "일"}
            highlightUserId={studentSession.userId}
          />
        </section>
        </>
        )}

        <footer className="mt-10 text-center text-[11.5px] text-[#95a5b8]">
          이름은 개인정보 보호를 위해 마스킹되어 표시됩니다 · powered by AWS Kiro
        </footer>
      </main>
    </div>
  );
}
