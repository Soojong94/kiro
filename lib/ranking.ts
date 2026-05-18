import { maskName } from "./mask";
import type { DailyUsage, RankRow, School, Student } from "./types";

export type Period = "yesterday" | "7d" | "this_month" | "last_month" | "custom";
export type Metric = "credits" | "attendance";

// undefined 또는 "all" 이면 전체 조직
function matchSchool(rowSchoolId: string, filter?: string): boolean {
  if (!filter || filter === "all") return true;
  return rowSchoolId === filter;
}

export function periodWindow(
  period: Period,
  today = new Date(),
  custom?: { from?: string; to?: string },
): { from: string; to: string } {
  if (period === "custom" && custom?.from && custom?.to) {
    const from = custom.from <= custom.to ? custom.from : custom.to;
    const to = custom.from <= custom.to ? custom.to : custom.from;
    return { from, to };
  }
  const t = new Date(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth(); // 0-indexed
  const yesterday = new Date(t);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  if (period === "yesterday") {
    return { from: yStr, to: yStr };
  }
  if (period === "7d") {
    const from = new Date(yesterday);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: from.toISOString().slice(0, 10), to: yStr };
  }
  if (period === "this_month") {
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { from, to: yStr };
  }
  if (period === "last_month") {
    const lm = m === 0 ? 11 : m - 1;
    const ly = m === 0 ? y - 1 : y;
    const lastDay = new Date(Date.UTC(ly, lm + 1, 0)).getUTCDate();
    const from = `${ly}-${String(lm + 1).padStart(2, "0")}-01`;
    const to = `${ly}-${String(lm + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }
  // custom fallback: this_month
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: yStr };
}

function inWindow(d: string, from: string, to: string) {
  return d >= from && d <= to;
}

// from/to 윈도우 직접 받는 내부 함수. period→window 변환과 분리해서 월별 챔피언 등에서 재사용.
function rankByCreditsWindow(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  from: string,
  to: string,
  schoolId?: string,
  topN = 10,
): RankRow[] {
  const sumByUser = new Map<string, number>();
  for (const r of usage) {
    if (!inWindow(r.date, from, to)) continue;
    if (!matchSchool(r.schoolId, schoolId)) continue;
    sumByUser.set(r.userId, (sumByUser.get(r.userId) ?? 0) + r.creditsUsed);
  }
  return toRankRows(sumByUser, students, schools, topN);
}

function rankByAttendanceWindow(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  from: string,
  to: string,
  schoolId?: string,
  topN = 10,
): RankRow[] {
  const daysByUser = new Map<string, Set<string>>();
  for (const r of usage) {
    if (!inWindow(r.date, from, to)) continue;
    if (!matchSchool(r.schoolId, schoolId)) continue;
    if (r.totalMessages <= 0) continue;
    let s = daysByUser.get(r.userId);
    if (!s) {
      s = new Set();
      daysByUser.set(r.userId, s);
    }
    s.add(r.date);
  }
  const counts = new Map<string, number>();
  for (const [uid, set] of daysByUser) counts.set(uid, set.size);
  return toRankRows(counts, students, schools, topN);
}

export function rankByCredits(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  period: Period,
  schoolId?: string,
  topN = 10,
  today = new Date(),
  custom?: { from?: string; to?: string },
): RankRow[] {
  const { from, to } = periodWindow(period, today, custom);
  return rankByCreditsWindow(usage, students, schools, from, to, schoolId, topN);
}

export function rankByAttendance(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  period: Period,
  schoolId?: string,
  topN = 10,
  today = new Date(),
  custom?: { from?: string; to?: string },
): RankRow[] {
  const { from, to } = periodWindow(period, today, custom);
  return rankByAttendanceWindow(usage, students, schools, from, to, schoolId, topN);
}

// metric 기준으로 적절한 함수 선택. 페이지에서 단일 호출로 통합.
export function computeRanking(
  metric: Metric,
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  period: Period,
  schoolId?: string,
  topN = 10,
  today = new Date(),
  custom?: { from?: string; to?: string },
): RankRow[] {
  return metric === "credits"
    ? rankByCredits(usage, students, schools, period, schoolId, topN, today, custom)
    : rankByAttendance(usage, students, schools, period, schoolId, topN, today, custom);
}

function toRankRows(
  scoreByUser: Map<string, number>,
  students: Student[],
  schools: School[],
  topN: number,
): RankRow[] {
  const studentByUid = new Map(students.map((s) => [s.userId, s]));
  const schoolById = new Map(schools.map((s) => [s.id, s]));
  const sorted = [...scoreByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);

  let rank = 0;
  let prevValue = Number.POSITIVE_INFINITY;
  return sorted.map(([uid, value], i) => {
    if (value < prevValue) {
      rank = i + 1;
      prevValue = value;
    }
    const stu = studentByUid.get(uid);
    const sch = stu ? schoolById.get(stu.schoolId) : undefined;
    return {
      userId: uid,
      schoolId: stu?.schoolId ?? "unknown",
      schoolName: sch?.name ?? "미등록 조직",
      maskedName: stu ? maskName(stu.realName) : "미등록 학생",
      value: round1(value),
      rank,
    };
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export interface DailyKpi {
  baseDate: string;
  activeYesterday: number;
  totalCreditsYesterday: number;
  cumulativeStudents: number;
  participatingSchools: number;
}

export interface SchoolPeriodStats {
  schoolId: string;
  activeStudents: number;  // 해당 기간에 한 번이라도 사용한 학생 수
  totalCredits: number;    // 해당 기간 총 크레딧 사용량
  totalMessages: number;
}

// 기간 안에서 학교별 요약 통계. 학교 카드 스트립에서 사용.
export function computeSchoolStats(
  usage: DailyUsage[],
  period: Period,
  today = new Date(),
  custom?: { from?: string; to?: string },
): Map<string, SchoolPeriodStats> {
  const { from, to } = periodWindow(period, today, custom);
  const acc = new Map<string, { users: Set<string>; credits: number; messages: number }>();
  for (const r of usage) {
    if (r.date < from || r.date > to) continue;
    if (r.totalMessages <= 0) continue;
    let bucket = acc.get(r.schoolId);
    if (!bucket) {
      bucket = { users: new Set(), credits: 0, messages: 0 };
      acc.set(r.schoolId, bucket);
    }
    bucket.users.add(r.userId);
    bucket.credits += r.creditsUsed;
    bucket.messages += r.totalMessages;
  }
  const out = new Map<string, SchoolPeriodStats>();
  for (const [schoolId, b] of acc) {
    out.set(schoolId, {
      schoolId,
      activeStudents: b.users.size,
      totalCredits: round1(b.credits),
      totalMessages: b.messages,
    });
  }
  return out;
}

export function computeKpi(usage: DailyUsage[], today = new Date()): DailyKpi {
  const { to: yEnd } = periodWindow("yesterday", today);
  const yesterdaySet = new Set<string>();
  let creditsY = 0;
  const everUsedSet = new Set<string>();
  const schoolsEver = new Set<string>();
  for (const r of usage) {
    if (r.totalMessages > 0) {
      everUsedSet.add(r.userId);
      schoolsEver.add(r.schoolId);
    }
    if (r.date === yEnd) {
      yesterdaySet.add(r.userId);
      creditsY += r.creditsUsed;
    }
  }
  return {
    baseDate: yEnd,
    activeYesterday: yesterdaySet.size,
    totalCreditsYesterday: round1(creditsY),
    cumulativeStudents: everUsedSet.size,
    participatingSchools: schoolsEver.size,
  };
}

export interface OrgComparisonRow {
  schoolId: string;
  schoolName: string;
  totalCredits: number;
  activeStudents: number;
  totalMessages: number;
  avgCreditsPerStudent: number;
}

// 어드민 대시보드용 — 모든 조직을 기간 동안 가로 비교.
// 학생 없거나 사용량 0 인 조직도 0 값으로 포함해서 차트 일관성 유지.
export function computeOrgComparison(
  usage: DailyUsage[],
  schools: School[],
  period: Period,
  today = new Date(),
  custom?: { from?: string; to?: string },
): OrgComparisonRow[] {
  const { from, to } = periodWindow(period, today, custom);
  const acc = new Map<
    string,
    { users: Set<string>; credits: number; messages: number }
  >();
  for (const s of schools) {
    acc.set(s.id, { users: new Set(), credits: 0, messages: 0 });
  }
  for (const r of usage) {
    if (r.date < from || r.date > to) continue;
    if (r.totalMessages <= 0) continue;
    const b = acc.get(r.schoolId);
    if (!b) continue; // 등록 안 된 조직 데이터는 무시
    b.users.add(r.userId);
    b.credits += r.creditsUsed;
    b.messages += r.totalMessages;
  }
  return schools
    .map((s) => {
      const b = acc.get(s.id)!;
      const active = b.users.size;
      const credits = round1(b.credits);
      return {
        schoolId: s.id,
        schoolName: s.name,
        totalCredits: credits,
        activeStudents: active,
        totalMessages: b.messages,
        avgCreditsPerStudent: active > 0 ? round1(credits / active) : 0,
      };
    })
    .sort((a, b) => b.totalCredits - a.totalCredits);
}

export interface MonthlyChampion {
  month: string;        // "YYYY-MM"
  monthLabel: string;   // "2026년 4월"
  champion: RankRow | null;
}

// 이번 달은 진행 중이라 1위가 매일 바뀌므로 제외 — 지난 달부터 거꾸로 monthsBack 개월.
// schoolId로 특정 조직만 한정 가능. UI에서는 현재 선택된 조직/메트릭에 종속.
export function computeMonthlyChampions(
  metric: Metric,
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  schoolId?: string,
  today = new Date(),
  monthsBack = 12,
): MonthlyChampion[] {
  const { to: yEnd } = periodWindow("yesterday", today);
  const [yStr, mStr] = yEnd.split("-");
  const baseYear = Number(yStr);
  const baseMonth = Number(mStr); // 1-12
  const out: MonthlyChampion[] = [];
  for (let i = 0; i < monthsBack; i++) {
    // 지난 달부터 시작 (i+1 만큼 과거). 이번 달은 건너뜀.
    const totalMonths = baseYear * 12 + (baseMonth - 1) - (i + 1);
    const year = Math.floor(totalMonths / 12);
    const monthIdx0 = ((totalMonths % 12) + 12) % 12;
    const mm = String(monthIdx0 + 1).padStart(2, "0");
    const firstDay = `${year}-${mm}-01`;
    const lastDayNum = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
    const lastDay = `${year}-${mm}-${String(lastDayNum).padStart(2, "0")}`;
    const ranked =
      metric === "credits"
        ? rankByCreditsWindow(usage, students, schools, firstDay, lastDay, schoolId, 1)
        : rankByAttendanceWindow(usage, students, schools, firstDay, lastDay, schoolId, 1);
    out.push({
      month: `${year}-${mm}`,
      monthLabel: `${year}년 ${monthIdx0 + 1}월`,
      champion: ranked[0] ?? null,
    });
  }
  return out;
}
