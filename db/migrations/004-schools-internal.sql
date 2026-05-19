-- 사내용 학교 (랭킹에서 제외 대상) 표시 컬럼.
-- 멱등 — 반복 실행 가능.

BEGIN;

ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- 기본: tbit 는 사내용. (다른 학교는 false)
UPDATE schools SET is_internal = true WHERE id = 'tbit' AND is_internal = false;

COMMIT;
