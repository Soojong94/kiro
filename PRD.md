# PRD — Kiro 학교 사용 현황 통합 대시보드 (다중 학교)

| 항목 | 값 |
| --- | --- |
| 문서 버전 | v0.3 (connections + IC sync) |
| 작성일 | 2026-05-14 / 최종 갱신 2026-05-20 |
| 담당 | 자체 (회사 내부) |
| 대상 | TBIT 가 AWS Kiro 를 제공한 **여러 학교** 학생 / TBIT 내부 보고 담당자 / 학교 운영자(뷰어) |
| 현재 상태 | MVP 동작 — 학생 통합 랭킹, 어드민 대시보드, IC 자동 sync, S3 ingest 멱등 처리, 90일 비번 알림 |
| 차후 목표 | AWS SES 마이그레이션, cross-account 학교 실제 합류, 자동 백업 |

---

## 1. 배경 / 문제

- 회사가 **복수의 학교(고등학교 + 대학교)**에 AWS Kiro 라이선스를 제공한다. 각 학교는 보통 자기 AWS 계정에서 Kiro를 운영.
- 학생들이 얼마나 활발히 쓰는지(토큰 사용량/출석)를 **학교를 가로지르는 통합 랭킹** 형태로 드러내 학생 동기 부여를 노린다.
- 동시에 **회사 내부**에서는 보고용으로 더 풍부한(원본 식별자 + 학교별 분리) 뷰가 필요하다.
- Kiro 콘솔 어드민 대시보드는 (a) 외부 공개 불가 (b) **다중 계정/다중 학교 통합 뷰 불가** (c) 마스킹/랭킹 커스터마이즈 불가.

## 2. 성공 지표 (MVP)

- 공개 대시보드 페이지 로드 < 2초 (캐시 hit 기준).
- 매일 전날 데이터가 한국시간 13:00 이전에 반영되어 있을 것 (Kiro CSV 02:00 UTC = 11:00 KST 발행).
- 사내 로그인 보고 페이지에서 한 번의 다운로드로 주간/월간 CSV 추출 가능.
- 학생 실명이 공개 API/HTML 응답에 단 한 건도 포함되지 않을 것 (회귀 테스트로 검증).

## 3. 사용자 / 권한 모델

| 역할 | 페이지 | 보이는 정보 | 인증 |
| --- | --- | --- | --- |
| 학생 (Kiro 사용자) | `/`, `/champions` | 본교 디폴트 + 전체 조직 토글, 마스킹 학생명. 본인 순위 핀 카드. | 학생 username + password (Argon2id) + iron-session 8h. 비번은 sync 가 자동 발급 (`samples/credentials/*.csv`) 또는 `/login/recover` 로 이메일 재설정 |
| 학교 운영자 (Kiro 미사용 뷰어) | 학생과 동일 | 학생과 동일 (사용량 데이터 없으니 랭킹에 본인 안 보임) | 슈퍼 어드민이 `/admin/students` 의 "수동 추가" 폼으로 발급 |
| 학교 어드민 | `/admin/*` | 본교 한정 — 학생 목록 + 비번 재발급/제거 + 본교 사용 현황 | 슈퍼 어드민이 발급. RBAC 로 본교만 노출 |
| 슈퍼 어드민 (TBIT) | `/admin/*` | 전 조직. 추가로 connection 관리 (S3/IC/role_arn), 학교 destructive 작업 | bootstrap-admin 으로 최초 1명 → 추가 발급은 어드민 페이지에서 |
| 사내 학교 (TBIT) 학생 | `/`, `/champions` | **랭킹/공개 페이지에서 완전 제외** (URL 직접 입력도 차단). 어드민에서만 보임 | 학생과 동일 |

## 4. 핵심 데이터 정의

### 4.1 Kiro CSV 컬럼 → 우리 모델

| CSV 컬럼 | 우리 컬럼 | 의미 |
| --- | --- | --- |
| `Date` | `daily_usage.date` | 해당 일자 (UTC) |
| (없음, ingest 시 주입) | `daily_usage.school_id` | 학생의 **실제 학교** (= IC 그룹). ingest 가 user_id 로 students 테이블 조회해서 매핑. CSV 한 벌에 여러 학교 학생이 섞여있어도 올바르게 분배됨 |
| `UserId` | `daily_usage.user_id` | IAM Identity Center 사용자 UUID. `(school_id, user_id)`가 자연키 |
| `Client_Type` | `daily_usage.client_type` | KIRO_IDE / KIRO_CLI / PLUGIN |
| `Subscription_Tier` | `students.tier`(스냅샷) | Pro / Pro+ / Power |
| `ProfileId` | (저장만) | 디버그용 |
| `Total_Messages` | `daily_usage.total_messages` | 메시지 총수 |
| `Chat_Conversations` | `daily_usage.chat_conversations` | 대화 세션 수 |
| `Credits_Used` | `daily_usage.credits_used` | **랭킹 점수 1번** ("토큰 사용량") |
| `Overage_Enabled` | `quota_overrides`로 별도 | 한도 초과 사용 허용 여부 |
| `Overage_Cap` | `quota_overrides.overage_cap` | 한도 |
| `Overage_Credits_Used` | `daily_usage.overage_credits_used` | 한도 초과 분 |
| `<modelName>_Messages` | `model_usage` 정규화 | 모델별 사용량 |

### 4.2 "출석" 정의

해당 일자 CSV에 사용자 행이 존재하고 `Total_Messages > 0` 이면 그 날 **출석**으로 본다. (Kiro엔 별도 로그인 이벤트가 노출되지 않으므로 사용 발생 = 출석으로 간주)

- 연속 출석일 계산은 PG 윈도우 함수로 매일 저녁 머티리얼라이즈드 뷰 갱신 (또는 ingest 마지막 단계에서 갱신).
- "주간 출석률" = (사용한 평일 수) / (해당 주 평일 수).

### 4.3 학생명 마스킹

- 한글 이름 길이별 규칙:
  - 2자: `김민` → `김*`
  - 3자: `김민준` → `김*준`
  - 4자: `남궁민준` → `남*민*` (성 1자 + 끝 1자만 유지, 중간 마스킹)
  - 외자/영문/특수: `홍` → `홍`, `John` → `J**n`
- 동명이인 충돌 시 같은 마스킹값이 여럿 나올 수 있음. 공개 화면은 그래도 마스킹값만 노출. 내부적으로는 `user_id`로 구분.

## 5. 페이지 사양

### 5.1 공개 대시보드 `/`

목적: 학생 동기 부여 + 학교/대외 홍보. **여러 학교를 한 화면에서 통합 비교.**

구성 요소:
1. 헤더: "전체 학교 통합 랭킹" + "기준일: YYYY-MM-DD (한국시간 · 매일 11:30 이후 갱신)" 표기.
2. KPI 카드 4개: 참여 학교 수 / 누적 사용 학생 / 어제 활성 학생 / 어제 총 크레딧.
3. **단일 통합 랭킹 카드** — 한 카드 안에서 3개 필터를 모두 조작:
   - **학교**: `전체 학교` / 학교A / 학교B / … (chip)
   - **지표**: `토큰 사용량` / `출석` (탭)
   - **기간**: `어제` / `최근 7일` / `최근 30일` (chip)
   - 모든 필터는 URL `searchParams` 기반 (`?school=&metric=&period=`) → client JS 0, SSR 캐시 친화적, 공유 가능.
   - 행마다 마스킹 이름 + 학교명. 같은 카드에서 학교 필터를 바꾸면 그 학교 안 Top 10으로 즉시 좁혀짐.
4. **1위 강조** — 1위 행은 골드 배지/★ 표시/배경 톤. 본인 식별 기능은 없음(로그인 X).
5. (v1.1) 차트: 일별 활성 학생 / 총 크레딧 추이 (최근 30일, 학교 비교 모드).

응답 캐시: 1시간 TTL (1일 1회 갱신이므로 길게 잡아도 무방).

### 5.2 관리자 대시보드 `/admin`

- `/admin/login` — username + password.
- `/admin` — 5.1 의 모든 위젯 + 실명 컬럼 + UserId 컬럼.
- `/admin/students` — 학생 매핑 테이블 CRUD (UserId ↔ 실명 ↔ 학교 ↔ 학년).
- `/admin/usage` — 임의 기간 + 임의 학생 필터, 모델별 사용량, CSV 다운로드.
- `/admin/quotas` (v2) — 학생별 `overage_cap` 조정 폼. 저장 시 `audit_log`에 기록. 실제 Kiro 쪽 적용은 콘솔 SOP 문서로 안내(자동화는 v3).
- `/admin/logs` — `audit_log` 조회.

## 6. 인증 / 보안 요구사항

- 비밀번호: 최소 12자, Argon2id, salt random. 평문 저장 금지.
- 세션: `iron-session` 쿠키, `httpOnly + secure + sameSite=lax`, 8시간 만료, 슬라이딩 갱신 X.
- 로그인 실패 5회 → 해당 username 60초 잠금. IP 기준 rate limit 별도.
- 모든 `/admin/*` 응답은 HTTP `Cache-Control: no-store`.
- 공개 API 응답에는 `real_name`, `email`, `user_id` 필드가 절대 포함되지 않도록 라우트 핸들러에 가드 함수(`assertPublicSafe(payload)`).
- 로그/에러 메시지에 SQL/스택트레이스 노출 금지.
- HTTPS 필수. nginx + Let's Encrypt.
- 환경변수에 비밀값. `.env.local`은 git ignore.

## 7. 데이터 파이프라인 (Ingest)

### 7.1 다중 학교 / 다중 AWS 계정

- 각 학교는 자기 AWS 계정에서 Kiro를 운영. `schools` 테이블에 학교당 한 행: `s3_bucket`, `s3_prefix`, `aws_region`, `role_arn`(있으면 cross-account AssumeRole, 없으면 우리 계정 직접 read).
- 학교 측이 만들어줘야 하는 IAM Role 신뢰관계 예시 — 우리 EC2 인스턴스 프로파일을 trusted entity로 등록, 권한은 `s3:ListBucket`/`s3:GetObject` 두 prefix 한정. (셋업 SOP는 §8에 첨부.)

### 7.2 갱신 주기 — 결론: 매일 1회 + 같은 날 재시도

Kiro CSV는 **매일 02:00 UTC에 정확히 1회만** 생성된다. 같은 날 더 자주 폴링해도 같은 파일이라 의미 없음. 따라서:

- **메인 cron**: KST 11:30 (= 02:30 UTC, Kiro 발행 30분 후) 한 번.
- **재시도 cron**: 메인이 그 학교 CSV를 못 찾았으면 1시간 간격 최대 5회 (KST 12:30, 13:30, 14:30, 15:30, 16:30).
- 그날 안에 끝까지 못 찾으면 다음 날 메인 cron까지 대기 + 어드민 알림(v2).
- (v2 옵션) 즉시성 더 필요하면 학교 S3 EventBridge → 우리 SQS push. 학교 N개 늘면 운영 부담이라 MVP에서는 보류.

### 7.3 Ingest 작업

1. systemd timer가 위 스케줄로 `npm run ingest -- --date <yesterday-UTC>` 호출.
2. ingest는 등록된 모든 학교를 순회하며:
   - 학교에 `role_arn`이 있으면 STS AssumeRole, 없으면 인스턴스 자격 그대로 사용.
   - S3 list: `s3://<bucket>/<prefix>/AWSLogs/<acct>/KiroLogs/user_report/<region>/<yyyy>/<mm>/<dd>/00/`
   - 발견된 CSV 모두 스트리밍 다운로드 → `csv-parse` → row-by-row.
   - `daily_usage` 와 `model_usage` 에 `(school_id, date, user_id, …)` 키로 `INSERT … ON CONFLICT … DO UPDATE` (멱등).
   - 새로 본 `(school_id, user_id)` 조합은 `students` 에 `real_name=NULL` 상태로 자동 추가 — 이후 어드민이 매핑 채움.
   - 학교 단위로 처리 결과를 `ingest_runs(school_id, date, status, rows, error, started_at, ended_at)` 테이블에 기록. 재시도 cron은 이 테이블을 보고 미완 학교만 다시 시도.
3. 실패 시: stderr로 에러 → systemd 저널 → (v2) 슬랙 알림.
4. 재실행 안전: 같은 일자/같은 학교 두 번 돌려도 결과 동일.

## 8. Kiro 셋업 절차 (학교마다 1회씩 수행)

> 이 절차가 끝나야 그 학교의 첫 CSV가 떨어진다. **학교별로 각자 자기 AWS 계정에서 수행.**

**학교 IT 담당자가 자기 AWS 계정에서:**

1. AWS 콘솔 → Kiro 콘솔로 이동.
2. **Identity 연결**: 학교가 이미 외부 IdP(Google Workspace / Microsoft Entra / Okta 등)를 쓰면 그걸 IAM Identity Center에 연결. 없으면 IAM Identity Center를 신규로 활성화.
3. **사용자/그룹 등록 + 라이선스 할당**: 학교에 부여하기로 한 티어(Pro / Pro+ / Power)로 학생 계정에 Kiro 구독 할당.
4. **S3 버킷 준비** (Kiro 프로파일과 같은 region/account):
   - 예: `s3://<school>-kiro-reports-<region>` (root 사용 금지, prefix 필수)
   - 버킷 정책: Kiro 서비스가 쓸 수 있도록 AWS 문서 권고 정책 적용.
   - 서버측 암호화 (SSE-S3 최소, 가능하면 SSE-KMS).
5. **Kiro 콘솔 → Settings → Kiro user activity reports → Edit**:
   - "Collect granular metrics per user" 토글 ON.
   - S3 URI 입력: `s3://<bucket>/<prefix>/` → 저장.
6. **우리에게 read 권한 부여 — IAM Role 생성**:
   - Role 이름 예: `KiroReadFor<회사명>`.
   - Trusted entity: 우리 EC2 인스턴스 프로파일 ARN (회사가 알려줌).
   - 권한 정책: `s3:ListBucket`(해당 버킷), `s3:GetObject`(`<prefix>/*`) 두 줄만.
   - 생성된 **Role ARN 을 회사에 전달**.
7. (회사) 받은 정보로 `schools` 테이블 한 줄 INSERT — `name, kind, aws_account_id, s3_bucket, s3_prefix, aws_region, role_arn`.
8. **첫 CSV 대기**: 익일 02:00 UTC(11:00 KST) 직후 S3에 객체 생성 확인.
9. **학생-UserId 매핑**: 첫 CSV에서 추출된 UserId 목록을 학교가 보내준 명단과 매칭. 어드민 UI(`/admin/students`)로 입력.

## 9. 인프라 / 배포

- **서버 1대 EC2** (사양 권장: 2vCPU / 4GB RAM / 30GB SSD, t3.small 정도). 학교 50개 미만 규모까지 단일 서버로 충분.
- 인스턴스 프로파일에 IAM Role 부여 — 학교들의 `KiroReadFor<회사명>` Role을 AssumeRole 할 수 있는 `sts:AssumeRole` 권한.
- 설치: `nginx`, `postgresql-16`, `nodejs 20`, `certbot`.
- systemd 유닛:
  - `kiro-web.service` — `npm start`
  - `kiro-ingest.timer` (KST 11:30) + `kiro-ingest-retry.timer` (KST 12:30~16:30 시간별)
- 백업: PG `pg_dump` 일 1회 → 우리 S3 버킷의 `/backups/` prefix (학교 버킷이 아님).
- 로그 회전: journald 기본.

## 10. 향후 단계 (out of scope for MVP)

- v1.1: 공개 대시보드 학교 필터 칩 (`?school=<id>`) + 일별 추이 차트.
- v2: 학생별 한도 상향 워크플로 — 어드민이 `overage_cap` 조정 → 자동으로 Kiro 콘솔 적용 (Kiro가 해당 변경에 대한 공식 API를 노출하면 그 시점에 자동화). **(v1에서 명시적으로 보류)**
- v2: 슬랙/이메일 알림 (학교별 ingest 실패, 한도 80% 도달).
- v2: 학교 S3 EventBridge → 우리 SQS push 로 near-realtime 적재 옵션.
- v2: 학생 본인 인증(학번 + 학교 발급 일회용 코드)으로 본인 한정 상세 페이지.
- v3: 본인 대시보드 + 학습 코칭 LLM (Kiro 활용 패턴 기반 피드백).

## 11. 열린 이슈 / 의사결정 필요

| # | 이슈 | 결정자 | 마감 |
| --- | --- | --- | --- |
| 1 | ~~PUBLIC_SCHOOL_NAME~~ → **다중 학교 전환으로 무효화. `schools` 테이블 사용** | — | 완료 |
| 2 | 도메인 — 후보: `kiro-rank.tbit.co.kr` | 인프라 | 첫 배포 전 |
| 3 | ~~운영 서버 위치~~ → **클라우드(EC2) 결정** | — | 완료 |
| 4 | ~~"본인 행 하이라이트"~~ → **빼기로 결정. 1위만 강조** | — | 완료 |
| 5 | 학교 IdP 사용 여부 (외부 SSO 없으면 IAM Identity Center 신규로 진행) | **학교마다 결정** | 학교별 Kiro 셋업 전 |
| 6 | ~~한도 상향 정책~~ → **v2로 연기** | — | 완료 |
| 7 | 첫 파일럿에 참여시킬 학교 1~2곳 선정 | 비즈니스 | MVP 발표 전 |
| 8 | 학교 IT에 전달할 IAM Role 생성 가이드 PDF/문서화 | 인프라 | 첫 학교 셋업 전 |

## 12. 참고 자료

- Kiro 어드민 대시보드: <https://kiro.dev/docs/enterprise/monitor-and-track/dashboard/>
- 사용자별 활동 리포트: <https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/>
- AWS 공식 샘플 (Streamlit 기반, 동일 CSV 사용): <https://github.com/aws-samples/sample-kiro-user-analytics-dashboard>
