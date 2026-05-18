-- 비밀번호 재설정 토큰 (학생용).
-- 멱등 — 반복 실행 가능.

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

-- 만료된 토큰 정리용 인덱스
CREATE INDEX IF NOT EXISTS idx_password_reset_expires
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;
