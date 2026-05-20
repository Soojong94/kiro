-- connections: AWS 계정 단위 인제스트 출처. 한 connection 이 N 학교를 호스팅 가능 (IC 그룹별).
--
-- 이전 모델: schools.s3_bucket / aws_account_id / role_arn 등 학교별로 보관 →
--          한 AWS 계정 안에 여러 학교 그룹이 있으면 정보 중복 + 의미 불일치 (S3 는 학교 단위가 아님)
-- 새 모델: connections 가 AWS/IC/S3 묶음 보관 → schools.connection_id 로 가리킴.
--          학교는 IC 그룹의 단순 표현 (이름 + kind + is_internal).

BEGIN;

CREATE TABLE IF NOT EXISTS connections (
  id              text         PRIMARY KEY,        -- 예: "tbit-main"
  name            text         NOT NULL,           -- 표시명. 예: "TBIT 메인 AWS"
  aws_account_id  text,                            -- 12자리. cross-account 시 검증 용도
  ic_instance_id  text,                            -- Identity Center 인스턴스 ID (예: d-XXXXXXXXXX)
  ic_region       text         NOT NULL DEFAULT 'us-east-1',
  s3_bucket       text,
  s3_prefix       text,
  s3_region       text         NOT NULL DEFAULT 'ap-northeast-2',
  role_arn        text,                            -- NULL = 자기 계정 (base creds). cross-account 시 AssumeRole 대상
  created_at      timestamptz  NOT NULL DEFAULT now()
);

-- schools 가 어느 connection 에 속하는지
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schools_connection ON schools(connection_id);

-- 기존 데이터 마이그레이션:
-- 메인 connection 스텁만 생성 — 실제 값(IC 인스턴스 ID / S3 / role_arn) 은 어드민이
-- /admin/connections 편집 화면에서 채움. 자격증명/식별자 정보를 SQL 에 박지 않기 위함.
-- 또한 기존 schools 의 S3/AWS 정보가 있으면 그것도 함께 복사 (legacy 호환).
INSERT INTO connections
  (id, name, aws_account_id, ic_instance_id, ic_region, s3_bucket, s3_prefix, s3_region, role_arn)
SELECT
  'tbit-main',
  'TBIT 메인 AWS',
  aws_account_id,
  NULL,                    -- IC 인스턴스 ID 는 어드민 UI 에서 채울 것
  'us-east-1',
  s3_bucket,
  s3_prefix,
  aws_region,
  role_arn
FROM schools
WHERE id = 'tbit'
ON CONFLICT (id) DO NOTHING;

-- schools 에 'tbit' 행이 없는 경우 대비 — 빈 stub 만들고 어드민이 모두 채우게.
INSERT INTO connections (id, name)
VALUES ('tbit-main', 'TBIT 메인 AWS')
ON CONFLICT (id) DO NOTHING;

-- 기존 모든 학교를 tbit-main connection 으로 연결 (한 IC 가 모두 호스팅 중인 현 상태 반영)
UPDATE schools
   SET connection_id = 'tbit-main'
 WHERE connection_id IS NULL
   AND id IN (SELECT id FROM schools);

COMMIT;
