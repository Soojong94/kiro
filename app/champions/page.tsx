import { LoginGateCard } from "@/components/LoginGateCard";
import { MonthlyChampionList } from "@/components/MonthlyChampionList";
import { NavBar } from "@/components/NavBar";
import { SchoolSearch } from "@/components/SchoolSearch";
import { MetricToggle } from "@/components/MetricToggle";
import { loadDailyUsage, loadSchools, loadStudents } from "@/lib/db-data";
import { computeMonthlyChampions, type Metric } from "@/lib/ranking";
import { getStudentSession } from "@/lib/student-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

const METRICS = new Set<Metric>(["credits", "attendance"]);

function pick<T extends string>(v: string | string[] | undefined, allowed: Set<T>, fallback: T): T {
  const s = Array.isArray(v) ? v[0] : v;
  return s && allowed.has(s as T) ? (s as T) : fallback;
}

export default async function ChampionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ── 학생 세션 게이트 ───────────────────────────────────────────────
  const studentSession = await getStudentSession();
  const loggedIn = !!studentSession.userId;
  if (loggedIn && studentSession.mustChangePassword) {
    redirect("/change-password");
  }

  const sp = await searchParams;
  const metric = pick(sp.metric, METRICS, "credits");
  const defaultSchool =
    loggedIn && studentSession.schoolId ? studentSession.schoolId : "all";
  const schoolParam = (Array.isArray(sp.school) ? sp.school[0] : sp.school) ?? defaultSchool;

  const [usage, students, schools] = await Promise.all([
    loadDailyUsage(365),
    loadStudents(),
    loadSchools(),
  ]);
  const school =
    schoolParam === "all" || schools.some((s) => s.id === schoolParam) ? schoolParam : "all";

  const monthly = computeMonthlyChampions(metric, usage, students, schools, school);

  const metricLabel = metric === "credits" ? "토큰 사용량" : "출석";
  const scopeLabel =
    school === "all" ? "전체 조직" : schools.find((s) => s.id === school)?.name ?? "선택 조직";

  const otherParamsExceptMetric = { school };
  const otherParamsExceptSchool = { metric };

  return (
    <div className="min-h-full" style={{ background: "#fafafa" }}>
      <NavBar />

      <main className="mx-auto max-w-5xl px-5 pt-8 pb-16 sm:px-6 sm:pt-10 lg:pt-12">

        {/* 뒤로 가기 */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[14px] font-semibold text-[#16191f] hover:bg-[#f2f3f3] transition-colors shadow-[0_1px_2px_rgba(0,28,36,0.05)]"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M13 4l-6 6 6 6" stroke="#414d5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            랭킹으로 돌아가기
          </Link>
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-[28px] sm:text-[36px] lg:text-[42px] font-bold tracking-tight leading-[1.15] text-[#16191f]">
            🏆 월별 챔피언
          </h1>
          <p className="mt-3 text-[14px] sm:text-[15px] text-[#414d5c]">
            지난 12개월 · 월별 1위 기록
          </p>
        </header>

        {!loggedIn ? (
          <LoginGateCard message="월별 챔피언을 보려면 로그인이 필요합니다." />
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
              <SchoolSearch
                schools={schools}
                value={school}
                otherParams={otherParamsExceptSchool}
                basePath="/champions"
              />
              <MetricToggle
                value={metric}
                otherParams={otherParamsExceptMetric}
                basePath="/champions"
              />
            </div>

            <MonthlyChampionList
              months={monthly}
              unitLabel={metric === "credits" ? "credit" : "일"}
              scopeLabel={scopeLabel}
              metricLabel={metricLabel}
            />
          </>
        )}

        <footer className="mt-10 text-center text-[11.5px] text-[#95a5b8]">
          이름은 개인정보 보호를 위해 마스킹되어 표시됩니다 · powered by AWS Kiro
        </footer>
      </main>
    </div>
  );
}
