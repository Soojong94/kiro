-- "유지하기" 버튼을 누르면 30일간 비번 모달 안 뜸.
-- password_reminded_at 가 NULL 또는 30일 이상 묵으면 다시 표시.

BEGIN;

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS password_reminded_at timestamptz;

COMMIT;
