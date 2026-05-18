-- 인증 + RBAC 도입 마이그레이션
-- 멱등 — 반복 실행 가능

BEGIN;

-- ── students: 학생 로그인 계정 (어드민이 발급, 미발급은 모두 NULL) ─────
ALTER TABLE students ADD COLUMN IF NOT EXISTS username             text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash        text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email                text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login_at        timestamptz;

-- username UNIQUE (NULL 끼리는 안 부딪침 — partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username
  ON students (username) WHERE username IS NOT NULL;
-- 이메일도 1:1 (찾기 기능에 사용)
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email
  ON students (lower(email)) WHERE email IS NOT NULL;

-- ── admins: RBAC (super / school) ───────────────────────────────────
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role      text NOT NULL DEFAULT 'super';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS school_id text REFERENCES schools(id);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS email     text;

-- role 값 제약 + school 이면 school_id 필수
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_role_chk;
ALTER TABLE admins ADD  CONSTRAINT admins_role_chk
  CHECK (role IN ('super', 'school'));

ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_school_role_chk;
ALTER TABLE admins ADD  CONSTRAINT admins_school_role_chk
  CHECK (role = 'super' OR school_id IS NOT NULL);

COMMIT;
