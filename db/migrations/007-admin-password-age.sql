-- 어드민 비번 갱신 알림용 — 비번이 바뀐 시점 추적.
-- 90일 이상 묵으면 로그인 후 모달로 갱신 권유.

BEGIN;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();

-- 기존 어드민 행은 created_at 으로 backfill (이미 존재하면 created_at = 그 시점)
UPDATE admins
   SET password_changed_at = COALESCE(created_at, now())
 WHERE password_changed_at IS NULL OR password_changed_at < created_at;

COMMIT;
