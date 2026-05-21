// 인제스트 완료 후 랭킹/KPI/월별챔피언을 미리 계산해 스냅샷 테이블에 저장.
// 대시보드 요청 시엔 이 스냅샷만 읽으면 된다 — 재계산 없음.

import { pool } from "@/lib/db";
import {
  computeKpi,
  computeRanking,
  computeMonthlyChampions,
  periodWindow,
  type Metric,
  type Period,
} from "@/lib/ranking";
import type { DailyUsage, School, Student } from "@/lib/types";

// 매일 갱신이 필요한 기간
const LIVE_PERIODS: Period[] = ["yesterday", "7d", "this_month"];
// 데이터가 확정된 기간 — 이번 달 초 이후 스냅샷이 있으면 재계산 생략
const PAST_PERIODS: Period[] = ["last_month"];
const METRICS: Metric[] = ["credits", "attendance"];

export async function computeAndStoreSnapshots(): Promise<void> {
  const today = new Date();
  const { usage, students, schools } = await loadUsageData();

  // 학교 ID 목록: '' = 전체 조직
  const schoolIds = ["", ...schools.map((s) => s.id)];

  // ── KPI (단일 행 upsert) ──────────────────────────────────────────
  const kpi = computeKpi(usage, today);
  await pool.query(
    `INSERT INTO kpi_snapshot (id, computed_at, base_date, data)
     VALUES (1, now(), $1, $2)
     ON CONFLICT (id) DO UPDATE
       SET computed_at = now(), base_date = $1, data = $2`,
    [kpi.baseDate, JSON.stringify(kpi)],
  );

  // ── 이번 달 초 — 지난 달 스냅샷의 "신선도" 기준 ─────────────────────
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const thisMonthStart = `${y}-${m}-01`;

  // last_month 는 이번 달 초 이후 스냅샷이 하나라도 있으면 확정 → 생략
  const { rows: freshCheck } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ranking_snapshot
       WHERE period = 'last_month' AND computed_at >= $1
     ) AS exists`,
    [thisMonthStart],
  );
  const lastMonthFresh = freshCheck[0]?.exists ?? false;

  const periodsToRun: Period[] = [
    ...LIVE_PERIODS,
    ...(lastMonthFresh ? [] : PAST_PERIODS),
  ];

  if (lastMonthFresh) {
    console.log("[snapshot] last_month 스냅샷 최신 — 재계산 생략");
  }

  // ── 기간 × 메트릭 × 학교 조합 랭킹 ─────────────────────────────────
  for (const period of periodsToRun) {
    const { from, to } = periodWindow(period, today);
    for (const metric of METRICS) {
      for (const schoolId of schoolIds) {
        const rows = computeRanking(
          metric,
          usage,
          students,
          schools,
          period,
          schoolId || undefined,
          100,
          today,
        );
        await pool.query(
          `INSERT INTO ranking_snapshot
             (period, metric, school_id, computed_at, date_from, date_to, rows)
           VALUES ($1, $2, $3, now(), $4, $5, $6)
           ON CONFLICT (period, metric, school_id) DO UPDATE
             SET computed_at = now(), date_from = $4, date_to = $5, rows = $6`,
          [period, metric, schoolId, from, to, JSON.stringify(rows)],
        );
      }
    }
  }

  // ── 월별 챔피언 (메트릭 × 학교) ─────────────────────────────────────
  for (const metric of METRICS) {
    for (const schoolId of schoolIds) {
      const months = computeMonthlyChampions(
        metric,
        usage,
        students,
        schools,
        schoolId || undefined,
        today,
      );
      await pool.query(
        `INSERT INTO monthly_champion_snapshot (metric, school_id, computed_at, months)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (metric, school_id) DO UPDATE
           SET computed_at = now(), months = $3`,
        [metric, schoolId, JSON.stringify(months)],
      );
    }
  }

  const combos = periodsToRun.length * METRICS.length * schoolIds.length;
  const champions = METRICS.length * schoolIds.length;
  console.log(
    `[snapshot] KPI + ${combos} 랭킹 + ${champions} 챔피언 스냅샷 저장 완료`,
  );
}

// daily_usage 를 메모리에 올려 lib/ranking.ts 함수에 전달.
// 스냅샷 계산 전용 — 공개 API 응답에 직접 사용 금지.
async function loadUsageData(): Promise<{
  usage: DailyUsage[];
  students: Student[];
  schools: School[];
}> {
  const [schoolRes, studentRes, usageRes] = await Promise.all([
    pool.query<{ id: string; name: string; kind: string }>(
      `SELECT id, name, kind FROM schools ORDER BY id`,
    ),
    pool.query<{
      school_id: string;
      user_id: string;
      real_name: string;
      cohort: string | null;
    }>(`SELECT school_id, user_id, real_name, cohort FROM students`),
    // 월별 챔피언 12개월 커버를 위해 400일치 로드
    pool.query<{
      date: string;
      school_id: string;
      user_id: string;
      client_type: string;
      subscription_tier: string | null;
      total_messages: number;
      chat_conversations: number;
      credits_used: number;
      overage_credits_used: number;
    }>(
      `SELECT
         date::text,
         school_id, user_id, client_type, subscription_tier,
         total_messages, chat_conversations,
         credits_used::float8,
         overage_credits_used::float8
       FROM daily_usage
       WHERE date >= (CURRENT_DATE - INTERVAL '400 days')
       ORDER BY date DESC`,
    ),
  ]);

  return {
    schools: schoolRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind as School["kind"],
    })),
    students: studentRes.rows.map((r) => ({
      userId: r.user_id,
      schoolId: r.school_id,
      realName: r.real_name,
      cohort: r.cohort ?? "",
    })),
    usage: usageRes.rows.map((r) => ({
      date: r.date,
      schoolId: r.school_id,
      userId: r.user_id,
      clientType: r.client_type as DailyUsage["clientType"],
      subscriptionTier: (r.subscription_tier ?? "Pro") as DailyUsage["subscriptionTier"],
      totalMessages: r.total_messages,
      chatConversations: r.chat_conversations,
      creditsUsed: r.credits_used,
      overageCreditsUsed: r.overage_credits_used,
      modelMessages: {}, // 랭킹 집계에 불필요
    })),
  };
}
