# Kiro 통합 랭킹 대시보드

회사가 학교/조직에 제공한 **AWS Kiro** 사용 현황을 학생 단위로 집계해 공정하고 가시적인 랭킹을 제공하는 웹 서비스. 학생은 본인 위치를 즉시 확인하고, 운영자(TBIT 및 각 학교 어드민)는 조직별 활용도와 학생별 활동을 한눈에 본다.

## 핵심 동작

```
학교 S3 (Kiro 일일 CSV)
  ↓  매일 02:30 UTC  cron — `npm run ingest`
PostgreSQL (daily_usage / model_usage / students / schools)
  ↓  인제스트 직후 스냅샷 미리 계산
ranking_snapshot / kpi_snapshot / monthly_champion_snapshot
  ↓
Next.js SSR  →  학생 페이지 (마스킹) · 어드민 페이지 (실명)
```

학생 계정은 AWS IAM Identity Center 의 그룹/사용자를 그대로 import — `npm run sync-identity-center` 가 02:15 UTC 에 별도 cron 으로 돈다. 학교 어드민이 학생을 수기 등록할 필요 없음.

## 기술 스택

- **프레임워크**: Next.js 16 (App Router, Turbopack) + TypeScript + React 19
- **UI**: Tailwind CSS v4, Toss 톤 (라이트 베이스, Pretendard)
- **DB**: PostgreSQL 16
- **인증**: Argon2id 해시 + iron-session 쿠키 (학생 / 어드민 분리 세션)
- **인프라**: Docker Compose + nginx + Let's Encrypt
- **클라우드**: AWS (S3 인제스트, IAM Identity Center 동기화, STS AssumeRole cross-account)

## 시작하기 (로컬)

전제: Docker Desktop 실행 중.

```bash
# 1. 환경변수 준비
cp .env.example .env.local
# .env.local 의 AWS_*, SMTP_*, SESSION_COOKIE_PASSWORD, ADMIN_BOOTSTRAP_PASSWORD 채우기

# 2. 컨테이너 기동 (postgres + next dev)
docker compose up -d

# 3. 어드민 부트스트랩 (1회)
docker exec kiro-next npm run bootstrap-admin

# 4. (선택) Identity Center 에서 학생 데이터 import
docker exec kiro-next npm run sync-identity-center

# → http://localhost:3000          (학생 페이지)
# → http://localhost:3000/admin    (어드민)
```

## 자주 쓰는 명령

| 명령 | 용도 |
|---|---|
| `docker exec kiro-next npm run ingest` | S3 에서 어제 CSV 가져와 DB 적재 |
| `docker exec kiro-next npm run sync-identity-center` | Identity Center → schools/students 동기화 |
| `docker exec kiro-next npm run bootstrap-admin` | 최초 super 어드민 생성 |
| `docker exec kiro-next npm run check-s3` | S3 접근 검증 |
| `docker exec kiro-next npm run check-smtp` | Gmail SMTP 연결 검증 |
| `docker exec kiro-next npm run typecheck` | tsc --noEmit |

## 디렉토리 구조

```
app/                    Next.js (App Router)
  page.tsx              학생 공개 랭킹
  champions/            월별 챔피언
  admin/                어드민 영역 (RBAC: super / school)
  login/, change-password/
components/             UI 컴포넌트
lib/
  db.ts                 pg 단일 풀
  db-data.ts            랭킹/스냅샷 로더
  ranking.ts            랭킹/KPI 집계 로직
  auth.ts               iron-session + Argon2id
  mask.ts               학생명 마스킹
  types.ts              CSV ↔ TS 타입
ingest/
  s3.ts                 학교별 S3 + STS AssumeRole 클라이언트
  parse.ts              Kiro CSV 파서
  sync.ts               cron 진입
  snapshot.ts           ranking/kpi/champion 스냅샷
scripts/
  bootstrap-admin.ts    최초 어드민 생성
  sync-identity-center.ts  Identity Center → DB 동기화
  check-*.ts            진단 유틸 (s3, smtp, identity-center)
db/
  schema.sql            초기 스키마
  migrations/           추가 마이그레이션
ops/                    nginx, SSL 셋업, 아카이브 청소 스크립트
docs/                   data-flow.drawio (구조도)
```

## 보안 / 운영 원칙

- 학생 실명은 **공개 응답에 절대 포함 금지** — `lib/mask.ts` 거친 값만 노출 (`김*준`)
- 학교가 사내(`schools.is_internal = true`) 인 경우 학생 공개 페이지의 '전체 조직' 뷰에서 제외
- 데이터 적재는 INSERT/UPSERT 만 — 정기 삭제 없음. 학생/학교 정리는 어드민 명시적 액션에만 트리거 (학생 + 사용량 + 모델별 사용량 단일 트랜잭션 wipe)
- S3 원본 CSV 는 `data/csv-archive/` 에 365일 보관 — DB 손상 시 재인제스트 가능
- 세션 쿠키: `httpOnly`, `secure`, `sameSite=lax`, 만료 8시간

## 더 보기

- `PRD.md` — 제품 요구사항
- `CLAUDE.md` — 코드 컨벤션 / 작업 가이드
- `DEPLOY.md` — 운영 서버 배포 절차
- `CROSS_ACCOUNT_S3.md` — 새 학교 (별도 AWS 계정) 온보딩 가이드
- `docs/data-flow.drawio` — 데이터 흐름 다이어그램
