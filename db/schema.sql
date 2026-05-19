-- Kiro 통합 랭킹 대시보드 DB 스키마
-- PostgreSQL 16+  |  멱등(IF NOT EXISTS) — 반복 실행 가능
-- 실행: psql "$DATABASE_URL" -f db/schema.sql

-- ─────────────────────────────────────────────────────────────────
-- 학교 (인제스트 대상 단위)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('high_school', 'university', 'region')),
  -- 사내용 학교 (TBIT 등) 표시 — 랭킹/공개 페이지에서 제외, 어드민에는 그대로 노출.
  is_internal    boolean NOT NULL DEFAULT false,
  aws_account_id text,
  s3_bucket      text,
  s3_prefix      text,
  aws_region     text NOT NULL DEFAULT 'ap-northeast-2',
  role_arn       text,   -- null → 우리 계정 직접; 있으면 cross-account AssumeRole
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 학생 (userId ↔ 실명 매핑)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  -- RESTRICT: 학교 삭제 시 학생(로그인 정보 포함) 보호. 정리는 앱 레이어에서 명시적으로.
  school_id             text        NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id               text        NOT NULL,
  real_name             text        NOT NULL,
  cohort                text,
  -- 학생 로그인 계정 (어드민이 발급, 미발급 학생은 모두 NULL)
  username              text,
  password_hash         text,
  email                 text,
  must_change_password  boolean     NOT NULL DEFAULT true,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id)
);
-- NULL 끼리는 안 부딪치도록 partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username
  ON students (username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email
  ON students (lower(email)) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────
-- 일별 사용량  (CSV 1행 → DB 1행, upsert 멱등)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_usage (
  date                 date         NOT NULL,
  school_id            text         NOT NULL REFERENCES schools(id),
  user_id              text         NOT NULL,
  client_type          text         NOT NULL,
  subscription_tier    text,
  total_messages       int          NOT NULL DEFAULT 0,
  chat_conversations   int          NOT NULL DEFAULT 0,
  credits_used         numeric(12,4) NOT NULL DEFAULT 0,
  overage_credits_used numeric(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, school_id, user_id, client_type)
);
CREATE INDEX IF NOT EXISTS idx_daily_usage_date   ON daily_usage (date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_school ON daily_usage (school_id, date);

-- ─────────────────────────────────────────────────────────────────
-- 모델별 사용량  (CSV 동적 컬럼 정규화)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_usage (
  date        date NOT NULL,
  school_id   text NOT NULL REFERENCES schools(id),
  user_id     text NOT NULL,
  model_name  text NOT NULL,
  messages    int  NOT NULL DEFAULT 0,
  PRIMARY KEY (date, school_id, user_id, model_name)
);

-- ─────────────────────────────────────────────────────────────────
-- 인제스트 실행 로그  (학교×날짜 단위, 재시도마다 새 행)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_runs (
  id         bigserial    PRIMARY KEY,
  school_id  text         NOT NULL REFERENCES schools(id),
  date       date         NOT NULL,
  status     text         NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  rows       int,
  error      text,
  started_at timestamptz  NOT NULL DEFAULT now(),
  ended_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ingest_runs ON ingest_runs (school_id, date, started_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 랭킹 스냅샷  (인제스트 완료 후 미리 계산해 저장)
--   period:    'yesterday' | '7d' | 'this_month' | 'last_month'
--   metric:    'credits'   | 'attendance'
--   school_id: ''          = 전체 조직
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ranking_snapshot (
  period       text         NOT NULL,
  metric       text         NOT NULL,
  school_id    text         NOT NULL,
  computed_at  timestamptz  NOT NULL DEFAULT now(),
  date_from    date         NOT NULL,
  date_to      date         NOT NULL,
  rows         jsonb        NOT NULL,   -- RankRow[]
  PRIMARY KEY (period, metric, school_id)
);

-- ─────────────────────────────────────────────────────────────────
-- KPI 스냅샷  (단일 행 유지)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_snapshot (
  id          int          PRIMARY KEY DEFAULT 1,
  computed_at timestamptz  NOT NULL DEFAULT now(),
  base_date   date         NOT NULL,
  data        jsonb        NOT NULL   -- DailyKpi
);

-- ─────────────────────────────────────────────────────────────────
-- 월별 챔피언 스냅샷
--   metric:    'credits' | 'attendance'
--   school_id: '' = 전체 조직
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_champion_snapshot (
  metric       text        NOT NULL,
  school_id    text        NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  months       jsonb       NOT NULL,   -- MonthlyChampion[]
  PRIMARY KEY (metric, school_id)
);

-- ─────────────────────────────────────────────────────────────────
-- 어드민 계정
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            bigserial    PRIMARY KEY,
  username      text         NOT NULL UNIQUE,
  password_hash text         NOT NULL,
  -- RBAC: super = 전 조직 / school = 본교만 (school_id 필수)
  role          text         NOT NULL DEFAULT 'super' CHECK (role IN ('super', 'school')),
  school_id     text         REFERENCES schools(id),
  email         text,
  last_login_at timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  CHECK (role = 'super' OR school_id IS NOT NULL)
);

-- 모든 어드민 변경 감사 로그
CREATE TABLE IF NOT EXISTS audit_log (
  id         bigserial    PRIMARY KEY,
  actor      text         NOT NULL,
  action     text         NOT NULL,
  target     text,
  payload    jsonb,
  created_at timestamptz  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- 학생 비밀번호 재설정 토큰 (이메일 자가 복구)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token             text         PRIMARY KEY,
  student_school_id text         NOT NULL,
  student_user_id   text         NOT NULL,
  expires_at        timestamptz  NOT NULL,
  used_at           timestamptz,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  FOREIGN KEY (student_school_id, student_user_id)
    REFERENCES students (school_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 학생별 초과 크레딧 한도 재정의 (차후 기능)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quota_overrides (
  school_id   text          NOT NULL REFERENCES schools(id),
  user_id     text          NOT NULL,
  overage_cap numeric(12,4) NOT NULL,
  note        text,
  updated_by  text,
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, user_id)
);
