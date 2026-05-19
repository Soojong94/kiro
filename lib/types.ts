// Kiro user activity report CSV 스키마와 1:1 대응되는 타입.
// CSV 컬럼명은 PascalCase + Underscore. 우리 코드에서는 camelCase로 변환해 사용.

// 실제 CSV 에서 본 값들. 새 값 들어오면 추가 (or 그냥 string 으로).
export type ClientType = "KIRO_IDE" | "KIRO_CLI" | "KIRO_WEB" | "PLUGIN" | (string & {});
export type SubscriptionTier = "PRO" | "PRO_PLUS" | "POWER" | "FREE" | (string & {});
// 조직 유형. 학교 외에도 지역·기관 단위 사용을 위해 region 포함.
export type SchoolKind = "high_school" | "university" | "region";

export interface School {
  id: string;          // 안정적인 슬러그. URL 쿼리에 그대로 노출.
  name: string;        // 화면 표기명 (예: "△△대학교")
  kind: SchoolKind;
  isInternal?: boolean; // 사내용 (TBIT 등) — 학생 랭킹/공개 페이지에서 제외.
  // 아래 필드는 ingest 워커만 사용. 공개 응답에 절대 포함 금지.
  awsAccountId?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  awsRegion?: string;
  roleArn?: string;    // null이면 우리 계정 직접 read, 있으면 cross-account AssumeRole
}

export interface DailyUsage {
  date: string;          // YYYY-MM-DD (UTC 기준 일자)
  schoolId: string;      // 어느 학교 소속 사용자인지. CSV 자체엔 없고 ingest 시점에 주입.
  userId: string;        // IAM Identity Center sub
  clientType: ClientType;
  subscriptionTier: SubscriptionTier;
  totalMessages: number;
  chatConversations: number;
  creditsUsed: number;
  overageCreditsUsed: number;
  modelMessages: Record<string, number>;
}

export interface Student {
  userId: string;
  schoolId: string;
  realName: string;     // 절대 공개 응답에 포함 금지
  cohort: string;       // 예: "2026-1학년"
}

export interface RankRow {
  userId: string;
  schoolId: string;
  schoolName: string;   // 통합 랭킹에서 행 옆에 표시
  maskedName: string;   // 공개 노출용
  value: number;
  rank: number;
}
