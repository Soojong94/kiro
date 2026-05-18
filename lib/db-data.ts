// 공개 페이지 / 어드민 대시보드용 DB 로더.
// mock.ts 의 getMock* 함수를 대체. 시그니처/리턴 타입을 동일하게 맞춰서
// computeRanking / computeKpi / computeOrgComparison 등이 그대로 동작.
//
// 인제스트 전이라 daily_usage 가 비어있으면 빈 배열 반환 → 페이지는 자연스럽게 빈 상태로 노출.

import { pool } from "./db";
import type { DailyUsage, School, Student } from "./types";

export async function loadSchools(): Promise<School[]> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    kind: School["kind"];
    aws_account_id: string | null;
    s3_bucket: string | null;
    s3_prefix: string | null;
    aws_region: string;
    role_arn: string | null;
  }>(
    `SELECT id, name, kind, aws_account_id, s3_bucket, s3_prefix, aws_region, role_arn
       FROM schools ORDER BY name`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    awsAccountId: r.aws_account_id ?? undefined,
    s3Bucket: r.s3_bucket ?? undefined,
    s3Prefix: r.s3_prefix ?? undefined,
    awsRegion: r.aws_region,
    roleArn: r.role_arn ?? undefined,
  }));
}

export async function loadStudents(): Promise<Student[]> {
  const { rows } = await pool.query<{
    school_id: string;
    user_id: string;
    real_name: string;
    cohort: string | null;
  }>(
    `SELECT school_id, user_id, real_name, cohort FROM students`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    schoolId: r.school_id,
    realName: r.real_name,
    cohort: r.cohort ?? "",
  }));
}

// daysBack 일치만큼 (어제 기준으로 거꾸로) daily_usage 조회.
// 월별 챔피언처럼 365+ 일 필요한 곳도 같은 함수 사용.
// modelMessages 는 페이지 랭킹/KPI 계산에 안 쓰므로 빈 객체로 반환.
export async function loadDailyUsage(daysBack: number): Promise<DailyUsage[]> {
  const { rows } = await pool.query<{
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
     WHERE date >= (CURRENT_DATE - ($1 || ' days')::interval)
     ORDER BY date DESC`,
    [daysBack],
  );
  return rows.map((r) => ({
    date: r.date,
    schoolId: r.school_id,
    userId: r.user_id,
    clientType: r.client_type as DailyUsage["clientType"],
    subscriptionTier: (r.subscription_tier ?? "Pro") as DailyUsage["subscriptionTier"],
    totalMessages: r.total_messages,
    chatConversations: r.chat_conversations,
    creditsUsed: r.credits_used,
    overageCreditsUsed: r.overage_credits_used,
    modelMessages: {},
  }));
}
