# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참고하는 프로젝트 가이드입니다.

## 프로젝트 한 줄 요약

학교에 제공된 **AWS Kiro** 사용 현황(토큰/크레딧 사용량, 출석)을 학생별로 랭킹하여 보여주는 통합 대시보드. 누구나 볼 수 있는 **공개 대시보드**(학생명 마스킹)와 사내 보고용 **관리자 대시보드**(로그인) 두 화면을 제공한다.

## 데이터 흐름 (반드시 이 그림으로 사고할 것)

```
Kiro Console
   └─ user activity report 활성화 (S3 URI 지정)
        │  매일 02:00 UTC, CSV 한 벌 생성
        ▼
S3 bucket (raw)
   s3://<bucket>/<prefix>/AWSLogs/<accountId>/KiroLogs/user_report/<region>/<yyyy>/<mm>/<dd>/00/<clientType>_<accountId>_user_report_<ts>.csv
        │  매일 한 번, 단일 서버의 cron job(또는 systemd timer)이 가져옴
        ▼
단일 서버 (PostgreSQL + Next.js + ingest worker)
   ├─ ingest: CSV 파싱 → upsert 로 PG에 적재 (멱등)
   ├─ Next.js (프로덕션 빌드, PM2 또는 systemd로 상시 가동)
   │    ├─ /          공개 대시보드 (인증 X, 학생명 마스킹)
   │    └─ /admin     관리자 대시보드 (로그인 필요)
   └─ nginx 리버스 프록시 + Let's Encrypt
```

**핵심 제약**
- Kiro의 사용 데이터는 **실시간 API가 없다.** 일 1회 CSV가 유일한 1차 소스다. 따라서 모든 대시보드는 최대 **24시간 지연**이 자연스럽다. "어제까지 기준" 표기를 항상 노출한다.
- CSV 1차 수신지는 **S3 강제** (다른 출력 경로 없음). 그 이후는 자유.
- UserId는 IAM Identity Center sub. 학생 실명 매핑은 별도 테이블(`students`)에 둔다.

## 디렉토리 구조 (목표)

```
kiro/
├── CLAUDE.md          ← 본 문서
├── PRD.md             ← 제품 요구사항
├── .claude/
│   └── settings.json  ← Claude Code 권한/도메인 화이트리스트
├── app/               ← Next.js (App Router, TypeScript)
│   ├── page.tsx               공개 대시보드
│   ├── admin/                 관리자 영역 (auth gate)
│   ├── api/                   route handlers (랭킹/통계 조회 API)
│   └── layout.tsx
├── components/        ← UI 컴포넌트 (Tailwind v4, Toss 톤)
│   ├── MetricToggle.tsx   ✅ (토큰/출석 전환)
│   ├── PeriodToggle.tsx   ✅ (어제/7일/30일, URL searchParams 기반, no client JS)
│   ├── RankingTable.tsx   ✅
│   └── SchoolSearch.tsx   ✅ (학교 검색 드롭다운, client component)
├── lib/
│   ├── db.ts          ← pg 연결 (single pool) — 미구현, 첫 CSV 도착 후
│   ├── auth.ts        ← Argon2id + iron-session 기반 사내 로그인 — 미구현 (관리자 페이지 단계)
│   ├── mask.ts        ← 학생명 마스킹 ("김민준" → "김*준")  ✅
│   ├── types.ts       ← CSV 컬럼 ↔ TS 타입 매핑                ✅
│   ├── ranking.ts     ← 토큰/출석 랭킹 집계 + KPI               ✅
│   └── kiro/          ← S3 client, CSV parser — 미구현
├── ingest/
│   ├── sync.ts        ← 메인 진입 (cron이 호출)
│   └── README.md      ← cron 설정 예시
├── db/
│   ├── schema.sql     ← 테이블 정의
│   ├── migrations/    ← 마이그레이션 파일
│   └── seed.sql       ← 학생-UserId 매핑 시드
├── ops/
│   ├── nginx.conf.example
│   ├── systemd/       ← next, ingest 타이머 유닛
│   └── deploy.sh
├── .env.example       ← 모든 환경변수 키 + 설명
├── package.json
├── tsconfig.json
└── tailwind.config.ts
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
# 개발
npm install
npm run dev                       # Next.js dev server
npm run typecheck                 # tsc --noEmit
npm run lint                      # eslint

# DB
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql

# Ingest 수동 실행 (디버그용)
npm run ingest                    # 어제 일자 분 가져오기
npm run ingest -- --date 2026-05-13

# 프로덕션
npm run build
npm start                         # systemd가 호출
```

## 환경 변수 (`.env.local`)

```
DATABASE_URL=postgres://kiro:****@127.0.0.1:5432/kiro
AWS_REGION=ap-northeast-2
# 우리 서버용 자격 (가능하면 EC2 instance profile로 대체)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SESSION_COOKIE_PASSWORD=<32+ chars random>
ADMIN_BOOTSTRAP_PASSWORD=<초기 어드민 비밀번호, 최초 1회만 사용>
TZ=Asia/Seoul
# 학교별 S3/Role 정보는 모두 DB(`schools` 테이블)에 저장. 환경변수 X.
```

## DB 스키마 요점

- `schools(id pk, name, kind('high_school'|'university'), aws_account_id, s3_bucket, s3_prefix, aws_region, role_arn null, created_at)` — 학교 = ingest 대상 단위.
- `students(school_id, user_id, real_name, cohort, created_at, pk(school_id, user_id))`
  - `(school_id, user_id)` 가 자연키. `real_name`은 공개 응답에 절대 노출 금지. 표시용은 `lib/mask.ts` 거친 값만.
- `daily_usage(date, school_id, user_id, client_type, total_messages, chat_conversations, credits_used, overage_credits_used, pk(date,school_id,user_id,client_type))`
- `model_usage(date, school_id, user_id, model_name, messages, pk(date,school_id,user_id,model_name))` — CSV의 동적 모델 컬럼 정규화.
- `ingest_runs(id, school_id, date, status, rows, error, started_at, ended_at)` — 학교 단위 ingest 결과. 재시도 cron이 미완 학교만 다시 시도.
- `quota_overrides(school_id, user_id, overage_cap, note, updated_by, updated_at, pk(school_id,user_id))` — 차후 학생별 한도 상향.
- `admins(id, username unique, password_hash, last_login_at, created_at)`
- `audit_log(id, actor, action, target, payload jsonb, created_at)` — 모든 어드민 변경 기록.

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

- 작업 시작 전 [PRD.md](PRD.md) 의 해당 섹션을 먼저 확인할 것.
- AWS Kiro 사용자 활동 리포트 셋업이 아직 안 끝났을 가능성이 높음. PRD §"Kiro 셋업 절차" 참고.
- AWS 공식 샘플 [`aws-samples/sample-kiro-user-analytics-dashboard`](https://github.com/aws-samples/sample-kiro-user-analytics-dashboard) 가 동일한 CSV를 다루므로 컬럼/매핑 검증할 때 교차 참고.
