-- ingest_runs 의 school_id → connection_id 로 의미 전환.
-- 인제스트 실행 단위가 학교가 아닌 connection (= AWS 계정) 이라서.

BEGIN;

-- FK 먼저 끊기
ALTER TABLE ingest_runs DROP CONSTRAINT IF EXISTS ingest_runs_school_id_fkey;

-- 컬럼 이름 변경
ALTER TABLE ingest_runs RENAME COLUMN school_id TO connection_id;

-- 새 FK — connections 참조
ALTER TABLE ingest_runs
  ADD CONSTRAINT ingest_runs_connection_id_fkey
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE;

-- 인덱스 이름은 그대로 두고 (기능 동일)

COMMIT;
