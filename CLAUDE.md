# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 가이드입니다.

## 프로젝트 한 줄 요약

학교에 제공된 **AWS Kiro** 사용 현황(토큰/크레딧, 출석)을 학생별로 랭킹하여 보여주는 통합 대시보드. **학생 페이지**(로그인 필요, 마스킹된 이름)와 **관리자 페이지**(슈퍼/학교 어드민) 두 영역 제공. **v1.1 운영 중** (v1.0 기능 + 보안 강화 + AWS SES).

## 데이터 흐름

```
AWS IAM Identity Center               Kiro Console
  └─ 그룹/사용자                       └─ user activity report → S3
            │                                     │  매일 02:00 UTC CSV 발행
            ▼                                     ▼
        매일 12:00 KST (= 03:00 UTC) 단일 cron — kiro-daily.timer
            │
            ├─ sync-identity-center   →  schools / students 자동 등록 + 신규 학생 초기 비번 CSV
            ├─ ingest                 →  S3 CSV → daily_usage / model_usage + 스냅샷 재계산
            └─ db-backup              →  pg_dump → s3://kiro-tbit/db-backups/ (30일 라이프사이클)
                              ↓
                         PostgreSQL
                              ↓
                ranking / kpi / monthly_champion_snapshot
                              ↓
                         Next.js SSR
                          ├─ /              학생 랭킹 (로그인 필요, 마스킹)
                          ├─ /leave         본인 탈퇴 (소프트, 어드민 복구)
                          └─ /admin         어드민 (RBAC: super / school)
                              ↓
                         nginx + Let's Encrypt
```

**핵심 제약**
- Kiro 데이터는 **실시간 API 없음.** 일 1회 CSV 가 유일한 1차 소스. 대시보드 최대 24시간 지연.
- 학생/학교 등록은 **AWS IAM Identity Center 가 단일 진리원천 (single source of truth).** sync 가 IC 그룹/사용자를 schools/students 테이블로 import. 수기 학생 추가는 Kiro 미사용 뷰어 계정 (학교 운영자 등) 전용.
- `students.user_id` = IC 사용자 UUID = Kiro CSV 의 UserId. 이 키로 IC 와 사용량 데이터를 매핑.
- 사내 학교 (`schools.is_internal = true`, 예: TBIT) 는 학생 페이지 어떤 경로로도 랭킹 노출 X. 어드민에는 그대로 보임.
- 학생 탈퇴 = `students.deactivated_at` 마킹 (소프트). 로그인 / 비번 재설정 차단, 데이터 / 랭킹 노출은 유지.

## 디렉토리 구조

```
kiro/
├── app/               ← Next.js (App Router)
│   ├── page.tsx               학생 통합 랭킹
│   ├── champions/             월별 챔피언
│   ├── change-password/       강제 비번 변경
│   ├── leave/                 학생 본인 탈퇴 (비번 재확인 + 동의)
│   ├── logout-deactivated/    탈퇴 학생 다른 디바이스 세션 정리 route handler
│   ├── login/                 학생 로그인 + 비번 찾기/재설정
│   └── admin/
│       ├── login/             어드민 로그인
│       └── (authed)/          RBAC 보호 영역
│           ├── page.tsx       대시보드 (조직 비교)
│           ├── students/      목록 + 검색 + 비번 재발급/제거/복구 + 수동 추가 + 초기 비번 일괄 CSV 다운로드 (super)
│           ├── schools/       목록 + 편집 (is_internal / wipe)
│           ├── connections/   AWS 계정/IC/S3 등록 (super)
│           └── admins/        어드민 추가/재발급/삭제 (super)
├── components/        ← UI (Tailwind v4)
├── lib/
│   ├── db.ts                  pg 단일 풀
│   ├── db-data.ts             랭킹/스냅샷 로더
│   ├── ranking.ts             랭킹/KPI 집계
│   ├── auth.ts                iron-session + Argon2id (어드민)
│   ├── student-auth.ts        학생 세션 + requireActiveStudent / deactivateStudent
│   ├── student-recovery.ts    비번 재설정 토큰 + deactivated 가드
│   ├── email.ts               AWS SES (us-east-1)
│   ├── mask.ts                학생명 마스킹
│   └── types.ts               CSV ↔ TS 타입
├── ingest/
│   ├── sync.ts                cron 진입 (S3 → DB)
│   ├── s3.ts                  S3 client + STS AssumeRole (cross-account, v1.1 미사용)
│   ├── parse.ts               Kiro CSV 파서
│   └── snapshot.ts            스냅샷 재계산
├── scripts/
│   ├── bootstrap-admin.ts             최초 super 어드민 생성
│   ├── sync-identity-center.ts        IC → schools/students 동기화 (cron 안에서 호출)
│   ├── reset-initial-passwords.ts     일회성: TBIT 외 학교 학생 비번 일괄 재발급
│   ├── backfill-initial-passwords.ts  일회성: 옛 sync CSV 로부터 initial_password 백필
│   ├── check-s3.ts                    S3 진단
│   ├── check-ses.ts                   SES 권한/region 진단
│   ├── check-identity-center.ts       IC 인스턴스 검색
│   ├── download-csv.ts                CSV 포맷 확인
│   └── test-ingest-local.ts           로컬 인제스트 검증
├── db/
│   ├── schema.sql             초기 스키마
│   └── migrations/            점진 변경 (현재 010 까지)
├── ops/
│   ├── daily-cron.sh          systemd 가 호출 — sync + ingest + db-backup 통합
│   ├── systemd/               kiro-daily.{service,timer}
│   ├── nginx-kiro.conf
│   ├── setup-ssl.sh           Let's Encrypt 1회용
│   ├── server-setup.sh        Ubuntu 초기 셋업 1회용
│   └── cleanup-archive.sh     CSV 아카이브 365일 정리 cron
├── docs/
│   ├── data-flow.drawio       구조도
│   └── private/               운영 매뉴얼 (gitignored)
└── samples/credentials/       sync / reset 가 생성한 학생 초기 비번 CSV (gitignored, bind mount)
```

## 기술 스택

- **런타임**: Node.js 20 LTS
- **프레임워크**: Next.js 16 (App Router, Turbopack) + TypeScript. ⚠ Next 16은 15와 API/관습이 일부 달라짐 — 새 코드 작성 전 `node_modules/next/dist/docs/` 확인. `searchParams` 는 Promise. **server component 에서 cookies 수정 불가** (destroy 는 server action / route handler 에서만).
- **UI**: Tailwind CSS v4 + Pretendard (CDN). 톤은 **Toss 모바일 앱 스타일** — 라이트 베이스(`#f4f5f7` 배경), 큰 둥근 모서리(`rounded-2xl/3xl`), 굵은 숫자, 토스 블루 `#3182f6` 액센트. **`dark:` 변형 추가 금지** (사용자가 다크 모드 자동 전환을 명시적으로 거절). 색 토큰은 `app/globals.css`의 `@theme inline` 변수(`--color-bg`, `--color-brand` 등) 사용.
- **DB**: PostgreSQL 16, 같은 서버에 설치. 라이브러리는 `pg` (postgres.js도 가능).
- **인증(사내 페이지)**: 비밀번호 = Argon2id 해시. 세션 = `iron-session`(쿠키 암호화). MFA는 v2.
- **CSV 동기화**: AWS SDK v3 (`@aws-sdk/client-s3`) + `csv-parse` 스트리밍.
- **프로세스 관리**: systemd timer (`kiro-daily.timer` 단일).
- **리버스 프록시**: nginx + Let's Encrypt(certbot).

## 자주 쓰는 명령

```bash
# 개발 (도커 dev 컨테이너 사용)
docker compose up -d                                       # postgres + next dev
docker exec kiro-next npm run typecheck                    # tsc --noEmit
docker exec kiro-next npm run lint

# DB 마이그레이션 (수동 적용 — 무조건 사람이)
docker exec -i kiro-pg psql -U kiro -d kiro < db/migrations/0XX-...sql
# 또는 전부 한 번에 (모두 IF NOT EXISTS / 멱등이라 안전):
for f in db/migrations/*.sql; do docker exec -i kiro-pg psql -U kiro -d kiro < "$f"; done

# Identity Center 동기화 — 운영에선 cron 안에서 호출
docker exec kiro-next npm run sync-identity-center -- --dry  # 미리보기
docker exec kiro-next npm run sync-identity-center            # 실제 적용

# Ingest 수동 실행 (디버그용 — 12:00 KST 이후만 안전)
docker exec kiro-next npm run ingest                          # 어제 자
docker exec kiro-next npm run ingest -- --date 2026-05-19    # 특정 날짜

# 이미 ok 마킹된 날짜 강제 재인제스트
docker exec kiro-pg psql -U kiro -d kiro -c "DELETE FROM ingest_runs WHERE date = '2026-05-XX'"
docker exec kiro-next npm run ingest -- --date 2026-05-XX

# 진단
docker exec kiro-next npm run check-s3              # S3 접근 확인
docker exec kiro-next npm run check-ses             # SES 권한/region 확인
docker exec kiro-next npm run check-identity-center # IC 인스턴스 조회
```

## 환경 변수 (`.env.local` / 서버 `.env`)

전체 키 목록은 `.env.example` 참조. 핵심:

```
DATABASE_URL=postgres://kiro:****@127.0.0.1:5432/kiro  # 로컬만, 서버는 compose 자동
DB_PASSWORD=...                                         # 서버만 (compose 가 DATABASE_URL 조립)
AWS_REGION=ap-northeast-2                               # base region (실제 ingest 는 connections.s3_region 사용)
SESSION_COOKIE_PASSWORD=<32+ chars random>
ADMIN_BOOTSTRAP_PASSWORD=<초기 어드민 비번, 최초 1회만>
EMAIL_FROM                                              # 발신 주소 (예: "Kiro <kiro@tbit.co.kr>")
SES_REGION=us-east-1                                    # SES 도메인 verify 한 region
APP_BASE_URL=https://kiro.tbit.co.kr
TZ=Asia/Seoul

# AWS 자격증명은 EC2 instance profile 사용 — 환경변수에 키 없음.
# AWS 계정/IC/S3 정보는 DB(connections 테이블) 에 저장 — 환경변수 X.
```

## DB 스키마 요점 (마이그레이션 010 까지)

- `connections(id pk, name, aws_account_id, ic_instance_id, ic_region, s3_bucket, s3_prefix, s3_region, role_arn null, created_at)` — **AWS 계정 단위 인제스트 출처.** 한 connection 이 여러 학교(IC 그룹) 호스팅 가능. cross-account 시 role_arn 으로 AssumeRole. 슈퍼 어드민만 등록/편집. v1.1 운영: `tbit-main` 1건.
- `schools(id pk, name, kind('high_school'|'university'|'region'), is_internal, connection_id fk, created_at)` — 학교 = IC 그룹의 우리 측 표현. id 는 IC 그룹명. sync 가 자동 생성. S3/IC 설정은 갖지 않음 (connection 으로 위임).
- `students(school_id, user_id, real_name, cohort null, username, email, password_hash, must_change_password, initial_password null, deactivated_at null, last_login_at, created_at, pk(school_id, user_id))`
  - `user_id` = IC 사용자 UUID. **`real_name`은 공개 응답에 절대 노출 금지.** 표시용은 `lib/mask.ts` 거친 값만.
  - 수기 추가 (뷰어 계정) 시 `user_id` 는 `randomUUID()` — IC UUID 와 충돌 가능성 사실상 0.
  - `initial_password` 는 sync 가 새 학생 INSERT 시 평문 1회 저장. 어드민 다운로드용. 학생이 비번 바꿔도 영구 유지.
  - `deactivated_at` 마킹된 학생은 로그인/비번 재설정 차단. 어드민이 NULL 로 복구.
- `daily_usage(date, school_id, user_id, client_type, ..., pk(date,school_id,user_id,client_type))`
  - `school_id` 는 **학생의 실제 school_id** (= IC 그룹). ingest 가 user_id 로 students 테이블 조회해서 매핑.
- `model_usage(date, school_id, user_id, model_name, messages, pk(date,school_id,user_id,model_name))`
- `ingest_runs(id, connection_id fk, date, status, rows, error, started_at, ended_at)` — connection × 날짜. `status='ok'` 면 ingest 가 skip (멱등). 강제 재인제스트는 해당 행 DELETE 후.
- `admins(id, username unique, password_hash, password_changed_at, role, school_id, email, password_reminded_at, last_login_at, created_at)` — 90일 묵으면 로그인 후 모달 권유.
- `password_reset_tokens(token pk, student_school_id, student_user_id, expires_at, used_at)` — 비번 재설정 1시간 토큰. deactivated 학생은 발급 / 사용 모두 차단.
- `audit_log(id, actor, action, target, payload jsonb, created_at)` — 모든 어드민 변경 기록.
- `ranking_snapshot / kpi_snapshot / monthly_champion_snapshot` — 인제스트 직후 미리 계산. 페이지는 이것만 SELECT.

## 인제스트 / 동기화 흐름

매일 **03:00 UTC (= 12:00 KST)** 에 `kiro-daily.timer` 가 단일 service 트리거 → `ops/daily-cron.sh` 가 순서대로 실행:

1. **sync-identity-center** — `connections` 의 IC 설정된 행 순회. (필요 시 STS AssumeRole 후) IC API 로 그룹/사용자 가져와 schools/students UPSERT. 신규 학생만 `initial_password` 컬럼 + `samples/credentials/*.csv` 동시 저장. `ON CONFLICT DO NOTHING` 이라 기존 학생/탈퇴 학생 안 건드림.
2. **ingest** — `connections` 의 S3 설정된 행 순회. AssumeRole 후 S3 CSV 다운로드 → `/data/csv-archive/<connection_id>/<date>/` 백업 → parseCsv → `students` 매핑으로 학생의 **실제 school_id** 찾아 daily_usage / model_usage UPSERT → snapshot 재계산.
3. **db-backup** — `pg_dump | gzip` → `s3://kiro-tbit/db-backups/kiro-db-<ts>.sql.gz`. 30일 라이프사이클로 자동 만료.
4. 성공/실패 메일 알림 (AWS SES, 수신자: `sujjong456@gmail.com`).

**멱등성 주의**: ingest 는 `ingest_runs.status='ok'` 마킹 보고 skip 함. 11~12시 KST 사이에 수동 ingest 돌리면 Kiro 가 아직 파일 안 떨군 상태에서 빈 처리 + ok 마킹 → 정작 12시 자동 cron 이 skip 됨. **수동 ingest 는 12:00 KST 이후에만**. 사고 시: `DELETE FROM ingest_runs WHERE date=...` 후 재실행.

## 코드 컨벤션

- 모든 파일 TypeScript. JS 새로 만들지 말 것.
- 서버 코드(route handler, ingest)는 `node:` 프리픽스로 표준 모듈 import.
- DB 쿼리는 매개변수 바인딩만 사용. 문자열 결합 SQL 금지.
- 학생 실명은 **공개 응답에 절대 포함 금지**. `mask()`를 거치지 않은 `real_name` 필드는 `/api/admin/*`에서만 노출.
- 비밀번호 검증은 Argon2id, salt는 라이브러리 기본값. 평문 비교 금지.
- 시간은 DB에 UTC로 저장, UI는 `Asia/Seoul`로 변환해 표기.
- 에러 메시지에 stack trace나 SQL을 노출하지 말 것.
- `session.destroy()` 는 무조건 `await` — Next 16 에서 redirect 가 throw 라 await 빼면 쿠키 제거 누락 가능.
- 학생 페이지 server component 는 `requireActiveStudent()` 사용 (deactivated 발견 시 `/logout-deactivated` 거쳐 `/login?deactivated=1` 으로 redirect). `/login` 같은 미인증 페이지에서는 그냥 `getStudentSession()`.

## 보안 가드레일

- 공개 API(`/api/public/*`)는 학생 실명/이메일/UserId 원본을 응답에 절대 넣지 않는다.
- 어드민 로그인은 IP 기반 rate limit + 5회 실패 시 60초 잠금.
- 세션 쿠키: `httpOnly`, `secure`, `sameSite=lax`. 학생 7일, 어드민 8시간.
- `ADMIN_BOOTSTRAP_PASSWORD`는 최초 어드민 생성 후 즉시 환경변수에서 제거.
- AWS 자격 증명은 EC2 instance profile 로 (현재 운영 그렇게). 키 직접 저장 금지.
- 비번 평문 (`students.initial_password`) 은 한 번 채워지면 영구 — 학생이 변경한 비번을 따로 저장하지 않음 (해시만).

**v1.1 보안 강화 (이미 적용됨)**:
- nginx 보안 헤더 5종: HSTS (1년) / X-Content-Type-Options nosniff / X-Frame-Options DENY / Referrer-Policy strict-origin-when-cross-origin / CSP frame-ancestors 'none'. ops/nginx-kiro.conf 참조.
- `/login/reset-password` access log 제외 — 비번 재설정 토큰 (1시간 / 1회용) 이 nginx 로그에 평문 노출되는 위험 차단.
- 로그인 시도 audit — `audit_log` 에 `{admin,student}.login.{success,fail}` 기록. 실패 시 actor=`ip:<ip>`, payload 에 reason. 의심 활동 SQL 쿼리는 docs/private/OPERATIONS.md 참조.
- 어드민 비번 변경 시 다른 디바이스 자동 logout — `getSession` 이 `admins.password_changed_at > session.loggedInAt` 비교. 본인 세션은 변경 액션이 `loggedInAt` 갱신해서 유지.

## 작업 시 참고

- 작업 시작 전 [PRD.md](PRD.md), [DEPLOY.md](DEPLOY.md) 참조. 운영 디테일은 `docs/private/OPERATIONS.md` (로컬 전용).
- 새 학교 합류 (단일 AWS 계정) 시 `/admin/connections/guide` 참고. UI 에서 connection 1건 등록 → sync → 자동 import.
- 새 학교가 별도 AWS 계정인 경우 [`CROSS_ACCOUNT_S3.md`](CROSS_ACCOUNT_S3.md) (v1.1 미사용).
- AWS 공식 샘플 [`aws-samples/sample-kiro-user-analytics-dashboard`](https://github.com/aws-samples/sample-kiro-user-analytics-dashboard) 가 동일한 CSV 를 다루므로 컬럼/매핑 검증 시 교차 참고.
- 마이그레이션 추가 시: `db/migrations/0XX-name.sql` 파일. 운영 적용은 **사람이 수동으로** (자동화 금지).
