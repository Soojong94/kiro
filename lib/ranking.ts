import { maskName } from "./mask";
import type { DailyUsage, RankRow, School, Student } from "./types";

export type Period = "yesterday" | "7d" | "30d";
export type Metric = "credits" | "attendance";

// undefined 또는 "all" 이면 전체 학교
function matchSchool(rowSchoolId: string, filter?: string): boolean {
  if (!filter || filter === "all") return true;
  return rowSchoolId === filter;
}

export function periodWindow(period: Period, today = new Date()): { from: string; to: string } {
  const t = new Date(today);
  const yesterday = new Date(t);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const to = yesterday.toISOString().slice(0, 10);
  const from = new Date(yesterday);
  if (period === "yesterday") {
    return { from: to, to };
  }
  if (period === "7d") {
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: from.toISOString().slice(0, 10), to };
  }
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to };
}

function inWindow(d: string, from: string, to: string) {
  return d >= from && d <= to;
}

export function rankByCredits(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  period: Period,
  schoolId?: string,
  topN = 10,
  today = new Date(),
): RankRow[] {
  const { from, to } = periodWindow(period, today);
  const sumByUser = new Map<string, number>();
  for (const r of usage) {
    if (!inWindow(r.date, from, to)) continue;
    if (!matchSchool(r.schoolId, schoolId)) continue;
    sumByUser.set(r.userId, (sumByUser.get(r.userId) ?? 0) + r.creditsUsed);
  }
  return toRankRows(sumByUser, students, schools, topN);
}

export function rankByAttendance(
  usage: DailyUsage[],
  students: Student[],
  schools: School[],
  period: Period,
  schoolId?: string,
  topN = 10,
  today = new Date(),
): RankRow[] {
  const { from, to } = periodWindow(period, today);
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
): RankRow[] {
  return metric === "credits"
    ? rankByCredits(usage, students, schools, period, schoolId, topN, today)
    : rankByAttendance(usage, students, schools, period, schoolId, topN, today);
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
      schoolName: sch?.name ?? "미등록 학교",
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
): Map<string, SchoolPeriodStats> {
  const { from, to } = periodWindow(period, today);
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
