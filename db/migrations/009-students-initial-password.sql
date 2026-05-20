-- 학생 초기 비번 평문 보관 — 첫 비번 변경 시 자동 NULL 처리.
-- 슈퍼 어드민이 학교별 일괄 다운로드 가능. 학생 본인이 비번 바꾸면 더 이상 노출 안 됨.

BEGIN;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS initial_password text;

-- 보조 인덱스 (다운로드 시 학교별 + 미변경 학생만 필터링 효율)
CREATE INDEX IF NOT EXISTS idx_students_initial_pw_lookup
  ON students (school_id)
  WHERE initial_password IS NOT NULL;

COMMIT;
