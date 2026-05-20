# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 가이드입니다.

## 프로젝트 한 줄 요약

학교에 제공된 **AWS Kiro** 사용 현황(토큰/크레딧, 출석)을 학생별로 랭킹하여 보여주는 통합 대시보드. **학생 페이지**(로그인 필요, 마스킹된 이름)와 **관리자 페이지**(슈퍼/학교 어드민) 두 영역 제공.

## 데이터 흐름

```
AWS IAM Identity Center                  Kiro Console
  └─ 그룹/사용자                          └─ user activity report → S3
        │  매일 02:15 UTC sync                 │  매일 02:00 UTC CSV 생성
        ▼                                       ▼
schools / students 자동 등록           S3 (raw CSV)
                                              │  02:30 UTC ingest cron
        ▼                                     ▼
        └────────► PostgreSQL ◄────────────────┘
                      │  ingest 직후 스냅샷 미리 계산
                      ▼
                 ranking / kpi / monthly_champion_snapshot
                      │
                      ▼
                 Next.js SSR
                  ├─ /         학생 랭킹 (로그인 필요, 마스킹)
                  └─ /admin    어드민 (RBAC: super / school)
                      │
                      ▼
                 nginx + Let's Encrypt
```

**핵심 제약**
- Kiro 데이터는 **실시간 API 없음.** 일 1회 CSV 가 유일한 1차 소스. 대시보드 최대 24시간 지연.
- 학생/학교 등록은 **AWS IAM Identity Center 가 단일 진리원천 (single source of truth).** sync 가 IC 그룹/사용자를 schools/students 테이블로 import. 수기 학생 추가는 Kiro 미사용 뷰어 계정 (학교 운영자 등) 전용.
- `students.user_id` = IC 사용자 UUID = Kiro CSV 의 UserId. 이 키로 IC 와 사용량 데이터를 매핑.
- 사내 학교 (`schools.is_internal = true`, 예: TBIT) 는 학생 페이지 어떤 경로로도 랭킹 노출 X. 어드민에는 그대로 보임.

## 디렉토리 구조

```
kiro/
├── app/               ← Next.js (App Router)
│   ├── page.tsx               학생 통합 랭킹
│   ├── champions/             월별 챔피언
│   ├── change-password/       강제 비번 변경
│   ├── login/                 학생 로그인 + 비번 찾기/재설정
│   └── admin/
│       ├── login/             어드민 로그인
│       └── (authed)/          RBAC 보호 영역
│           ├── page.tsx       대시보드 (조직 비교)
│           ├── students/      목록 + 검색 + 비번 재발급 + 제거 + 수동 추가 (뷰어 전용)
│           ├── schools/       목록 + 편집 (S3 설정 / is_internal / wipe)
│           └── admins/        어드민 추가/재발급/삭제 (슈퍼만)
├── components/        ← UI (Tailwind v4)
├── lib/
│   ├── db.ts                  pg 단일 풀
│   ├── db-data.ts             랭킹/스냅샷 로더
│   ├── ranking.ts             랭킹/KPI 집계
│   ├── auth.ts                iron-session + Argon2id
│   ├── student-auth.ts        학생 세션
│   ├── student-recovery.ts    비번 재설정 토큰
│   ├── email.ts               Gmail SMTP (→ AWS SES 마이그레이션 예정)
│   ├── mask.ts                학생명 마스킹
│   └── types.ts               CSV ↔ TS 타입
├── ingest/
│   ├── sync.ts                cron 진입 (S3 → DB)
│   ├── s3.ts                  S3 client + STS AssumeRole (cross-account)
│   ├── parse.ts               Kiro CSV 파서
│   └── snapshot.ts            스냅샷 재계산
├── scripts/
│   ├── bootstrap-admin.ts     최초 super 어드민 생성
│   ├── sync-identity-center.ts  IC → schools/students 동기화 (cron)
│   ├── check-s3.ts            S3 진단
│   ├── check-smtp.ts          SMTP 진단
│   ├── check-identity-center.ts  IC 인스턴스 검색
│   ├── download-csv.ts        CSV 포맷 확인
│   └── test-ingest-local.ts   로컬 인제스트 검증
├── db/
│   ├── schema.sql             초기 스키마
│   └── migrations/            점진 변경 (현재 004 까지)
├── ops/
│   ├── nginx-kiro.conf        nginx 리버스 프록시
│   ├── setup-ssl.sh           Let's Encrypt 발급 1회용
│   ├── server-setup.sh        Ubuntu 초기 셋업 1회용
│   └── cleanup-archive.sh     CSV 아카이브 365일 정리 cron
├── docs/
│   └── data-flow.drawio       구조도
└── samples/credentials/       sync 가 생성한 학생 초기 비번 CSV (gitignored)
```

## 기술 스택

- **런타임**: Node.js 20 LTS
- **프레임워크**: Next.js 16 (App Router, Turbopack) + TypeScript. ⚠ Next 16은 15와 API/관습이 일부 달라짐 — 새 코드 작성 전 `node_modules/next/dist/docs/` 확인. `searchParams` 는 Promise.
- **UI**: Tailwind CSS v4 + Pretendard (CDN). 톤은 **Toss 모바일 앱 스타일** — 라이트 베이스(`#f4f5f7` 배경), 큰 둥근 모서리(`rounded-2xl/3xl`), 굵은 숫자, 토스 블루 `#3182f6` 액센트. **`dark:` 변형 추가 금지** (사용자가 다크 모드 자동 전환을 명시적으로 거절). 색 토큰은 `app/globals.css`의 `@theme inline` 변수(`--color-bg`, `--color-brand` 등) 사용.
- **DB**: PostgreSQL 16, 같은 서버에 설치. 라이브러리는 `pg` (postgres.js도 가능).
- **인증(사내 페이지)**: 비밀번호 = Argon2id 해시. 세션 = `iron-session`(쿠키 암호화). MFA는 v2.
- **CSV 동기화**: AWS SDK v3 (`@aws-sdk/client-s3`) + `csv-parse` 스트리밍.
- **프로세스 관리**: systemd (Next.js 서비스 + ingest 타이머). PM2도 가능.
- **리버스 프록시**: nginx + Let's Encrypt(certbot).

## 자주 쓰는 명령

```bash
# 개발 (도커 dev 컨테이너 사용)
docker compose up -d                                       # postgres + next dev
docker exec kiro-next npm run typecheck                    # tsc --noEmit
docker exec kiro-next npm run lint

# DB 마이그레이션 (수동 적용 — 새 마이그레이션 추가 시)
docker exec -i kiro-pg psql -U kiro -d kiro < db/migrations/00X-...sql
# 또는 전부 한 번에 (모두 IF NOT EXISTS / 멱등이라 안전):
for f in db/migrations/*.sql; do docker exec -i kiro-pg psql -U kiro -d kiro < "$f"; done

# Identity Center 동기화 (학교/학생 등록) — 운영에선 cron
docker exec kiro-next npm run sync-identity-center -- --dry  # 미리보기
docker exec kiro-next npm run sync-identity-center            # 실제 적용

# Ingest 수동 실행 (디버그용)
docker exec kiro-next npm run ingest                          # 어제 자
docker exec kiro-next npm run ingest -- --date 2026-05-19    # 특정 날짜

# 진단
docker exec kiro-next npm run check-s3              # S3 접근 확인
docker exec kiro-next npm run check-smtp            # Gmail SMTP 확인
docker exec kiro-next npm run check-identity-center # IC 인스턴스 조회
```

## 환경 변수 (`.env.local` / 서버 `.env`)

전체 키 목록은 `.env.example` 참조. 핵심:

```
DATABASE_URL=postgres://kiro:****@127.0.0.1:5432/kiro  # 로컬만, 서버는 compose 자동
DB_PASSWORD=...                                         # 서버만 (compose 가 DATABASE_URL 조립)
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=...      # 베이스 자격증명 (cross-account 는 STS AssumeRole 로)
AWS_SECRET_ACCESS_KEY=...
SESSION_COOKIE_PASSWORD=<32+ chars random>
ADMIN_BOOTSTRAP_PASSWORD=<초기 어드민 비번, 최초 1회만>
SMTP_HOST/PORT/USER/PASS/EMAIL_FROM  # 학생 이메일 토큰용 — Gmail (→ SES 마이그레이션 예정)
APP_BASE_URL=https://kiro.tbit.co.kr
TZ=Asia/Seoul
# AWS 계정/IC/S3 정보는 DB(connections 테이블) 에 저장. 환경변수 X.
```

## DB 스키마 요점

- `connections(id pk, name, aws_account_id, ic_instance_id, ic_region, s3_bucket, s3_prefix, s3_region, role_arn null, created_at)` — **AWS 계정 단위 인제스트 출처.** 한 connection 이 여러 학교(IC 그룹) 호스팅 가능. cross-account 시 role_arn 으로 AssumeRole. 슈퍼 어드민만 등록/편집.
- `schools(id pk, name, kind('high_school'|'university'|'region'), is_internal, connection_id fk, created_at)` — 학교 = IC 그룹의 우리 측 표현. id 는 IC 그룹명. sync 가 자동 생성. S3/IC 설정은 갖지 않음 (connection 으로 위임).
- `students(school_id, user_id, real_name, cohort null, username, email, password_hash, must_change_password, last_login_at, created_at, pk(school_id, user_id))`
  - `user_id` = IC 사용자 UUID. **`real_name`은 공개 응답에 절대 노출 금지.** 표시용은 `lib/mask.ts` 거친 값만.
  - 수기 추가 (뷰어 계정) 시 `user_id` 는 `randomUUID()` — IC UUID 와 충돌 가능성 사실상 0.
- `daily_usage(date, school_id, user_id, client_type, ..., pk(date,school_id,user_id,client_type))`
  - `school_id` 는 **학생의 실제 school_id** (= IC 그룹). ingest 가 user_id 로 students 테이블 조회해서 매핑.
- `model_usage(date, school_id, user_id, model_name, messages, pk(date,school_id,user_id,model_name))`
- `ingest_runs(id, connection_id fk, date, status, rows, error, started_at, ended_at)` — connection × 날짜 단위. 재시도 cron 이 미완 connection 만 다시 시도.
- `admins(id, username unique, password_hash, password_changed_at, role, school_id, email, last_login_at, created_at)` — `password_changed_at` 이 90일 이상 묵으면 로그인 후 모달로 갱신 권유.
- `password_reset_tokens(token pk, user_id, school_id, type, expires_at, used_at)` — 비번 재설정 1시간 토큰.
- `audit_log(id, actor, action, target, payload jsonb, created_at)` — 모든 어드민 변경 기록.
- `ranking_snapshot / kpi_snapshot / monthly_champion_snapshot` — 인제스트 직후 미리 계산. 페이지는 이것만 SELECT.

## 인제스트 / 동기화 흐름

1. **sync-identity-center cron (02:15 UTC)** — `connections` 의 IC 설정된 행 순회. AssumeRole 후 IC API 로 그룹/사용자 가져와 schools/students UPSERT. 신규 학생은 랜덤 초기 비번 + `samples/credentials/*.csv`.
2. **ingest cron (02:30 UTC)** — `connections` 의 S3 설정된 행 순회. AssumeRole 후 S3 의 CSV 다운로드 → `/data/csv-archive/<connection_id>/<date>/` 백업 → parseCsv → `students` 매핑으로 학생의 **실제 school_id** 찾아 daily_usage/model_usage UPSERT → snapshot 재계산.
3. 둘 다 **멱등**. 같은 날짜 재실행 시 INSERT 가 아닌 UPDATE 로 덮어쓰기 (이중 적재 X).
4. `ingest_runs` 가 'ok' 면 skip — 강제 재인제스트는 해당 행 DELETE 후 재실행.

## 코드 컨벤션

- 모든 파일 TypeScript. JS 새로 만들지 말 것.
- 서버 코드(route handler, ingest)는 `node:` 프리픽스로 표준 모듈 import.
- DB 쿼리는 매개변수 바인딩만 사용. 문자열 결합 SQL 금지.
- 학생 실명은 **공개 응답에 절대 포함 금지**. `mask()`를 거치지 않은 `real_name` 필드는 `/api/admin/*`에서만 노출.
- 비밀번호 검증은 Argon2id, salt는 라이브러리 기본값. 평문 비교 금지.
- 시간은 DB에 UTC로 저장, UI는 `Asia/Seoul`로 변환해 표기.
- 에러 메시지에 stack trace나 SQL을 노출하지 말 것.

## 보안 가드레일

- 공개 API(`/api/public/*`)는 학생 실명/이메일/UserId 원본을 응답에 절대 넣지 않는다.
- 어드민 로그인은 IP 기반 rate limit + 5회 실패 시 60초 잠금.
- 세션 쿠키: `httpOnly`, `secure`, `sameSite=lax`, 만료 8시간.
- `ADMIN_BOOTSTRAP_PASSWORD`는 최초 어드민 생성 후 즉시 환경변수에서 제거.
- AWS 자격 증명은 가능하면 EC2 IAM Role로 대체. 키 직접 저장은 비권장.

## 작업 시 참고

- 작업 시작 전 [PRD.md](PRD.md), [DEPLOY.md](DEPLOY.md), [CROSS_ACCOUNT_S3.md](CROSS_ACCOUNT_S3.md) 참조.
- 새 학교 합류 시 `/admin/connections/guide` 참고. UI 에서 connection 1건 등록 → sync → 자동 import.
- AWS 공식 샘플 [`aws-samples/sample-kiro-user-analytics-dashboard`](https://github.com/aws-samples/sample-kiro-user-analytics-dashboard) 가 동일한 CSV 를 다루므로 컬럼/매핑 검증 시 교차 참고.
- 마이그레이션 추가 시: `db/migrations/00X-name.sql` 파일 + DEPLOY.md §4 에서 일괄 적용.
