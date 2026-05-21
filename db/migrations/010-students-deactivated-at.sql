-- 010 — 학생 소프트 탈퇴.
--
-- 학생이 본인 의사로 대시보드에서 "내 계정 나가기" 클릭 시 채워짐.
-- 로그인 차단 / 랭킹 노출 차단의 단일 기준.
-- daily_usage / model_usage 는 그대로 유지 (조직 통계 보존) — 이름만 노출 안 함.
-- 어드민은 학생 목록에서 "복구" 버튼 한 번으로 다시 활성화 (UPDATE deactivated_at = NULL).
--
-- sync-identity-center 는 ON CONFLICT DO NOTHING 이라 deactivated_at 자동 안 건드림 →
-- 학생이 IC 에서 살아있어도 sync 가 강제 재활성화 X. 어드민 의사로만 복구 가능.

BEGIN;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- 랭킹 / KPI 쿼리들이 자주 WHERE deactivated_at IS NULL 로 거름.
-- 부분 인덱스로 활성 학생만 빠르게 스캔.
CREATE INDEX IF NOT EXISTS idx_students_active
  ON students(school_id) WHERE deactivated_at IS NULL;

COMMIT;
