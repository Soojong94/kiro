# PRD — Kiro 학교 사용 현황 통합 대시보드 (다중 학교)

| 항목 | 값 |
| --- | --- |
| 문서 버전 | v1.1 (보안 강화 — nginx 헤더, 로그인 audit, 비번 변경 시 세션 무효화) |
| 작성일 | 2026-05-14 / 최종 갱신 2026-05-21 |
| 담당 | 자체 (회사 내부) |
| 대상 | TBIT 가 AWS Kiro 를 제공한 **여러 학교** 학생 / TBIT 내부 보고 담당자 / 학교 운영자(뷰어) |
| 현재 상태 | **v1.1 운영 중** — kiro.tbit.co.kr, 단일 cron (12:00 KST), 학생 탈퇴 + 복구, 초기 비번 일괄 다운로드, S3 자동 DB 백업, **보안 헤더 + 로그인 audit + 비번 변경 세션 무효화**. AWS SES 발송 (us-east-1) |
| 차후 목표 | cross-account 학교 실제 합류, 어드민 MFA, 학생 알림, 더 엄격한 CSP (nonce-based) |

각 요구사항 옆 태그:
- **[✓ v1.0]** — 구현 완료
- **[v2]** — 미구현, 차후
- **[v1.1]** — 가까운 다음 릴리즈

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

## 5. 페이지 사양 [✓ v1.0]

### 5.1 공개 대시보드 `/`  [✓ v1.0]

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

- `/admin/login` — username + password. [✓ v1.0]
- `/admin` — 5.1 의 모든 위젯 + 실명 컬럼 + UserId 컬럼. [✓ v1.0]
- `/admin/students` — 학생 목록 + 비번 재발급/제거 + **탈퇴 학생 복구** + 수동 추가 (뷰어) + **초기 비밀번호 일괄 CSV 다운로드 (super)** [✓ v1.0]
- `/admin/schools` — 학교 편집 (is_internal / wipe) [✓ v1.0]
- `/admin/connections` — AWS 계정/IC/S3 등록 (super) [✓ v1.0]
- `/admin/admins` — 어드민 추가/재발급/삭제 (super) [✓ v1.0]
- `/admin/quotas` — 학생별 `overage_cap` 조정 [v2]
- `/admin/usage` — 임의 기간 CSV 다운로드 [v2 — 현재는 초기 비밀번호 CSV 만]
- `/admin/logs` — `audit_log` 조회 [v2 — audit_log 테이블은 있고 기록 중]

## 6. 인증 / 보안 요구사항 [✓ v1.0]

- 비밀번호: 최소 8자 (v1.0 — PRD 초안 12자 였으나 학생 UX 고려 완화), Argon2id, salt random. 평문 저장 금지. [✓]
- 세션: `iron-session` 쿠키, `httpOnly + secure + sameSite=lax`, 학생 7일 / 어드민 8시간. [✓]
- 로그인 실패 5회 → 해당 username 60초 잠금. IP 기준 rate limit 별도. [✓]
- 모든 `/admin/*` 응답은 HTTP `Cache-Control: no-store`. [✓]
- 공개 API 응답에는 `real_name`, `email`, `user_id` 필드가 절대 포함되지 않도록 마스킹. [✓]
- 로그/에러 메시지에 SQL/스택트레이스 노출 금지. [✓]
- HTTPS 필수. nginx + Let's Encrypt. [✓]
- 환경변수에 비밀값. `.env`는 git ignore. AWS 자격증명은 EC2 instance profile. [✓]
- 학생 탈퇴 시 모든 디바이스 세션 즉시 무효화 + 미사용 비번 재설정 토큰 동시 무효화. [✓ v1.0]

**v1.1 보안 강화 (적용 완료)**:
- nginx 보안 헤더: HSTS (1년) / X-Content-Type-Options nosniff / X-Frame-Options DENY / Referrer-Policy strict-origin-when-cross-origin / CSP frame-ancestors 'none'. [✓ v1.1]
- 비번 재설정 토큰이 들어가는 `/login/reset-password` 경로 nginx access log 비활성화 — 토큰이 로그에 평문 노출되는 위험 차단. [✓ v1.1]
- 로그인 시도 audit 기록 (성공/실패 모두) — `audit_log` 에 `{admin,student}.login.{success,fail}` action 으로 저장. 실패 시 actor 는 ip 기록, reason (`wrong_password` / `user_not_found`) 까지. [✓ v1.1]
- 어드민 비번 변경 시 다른 디바이스 세션 즉시 무효화 — `admins.password_changed_at` 기준 `loggedInAt` 비교, getSession 가드에서 자동 처리. 본인 세션은 변경 액션이 `loggedInAt` 갱신해서 유지. [✓ v1.1]

- 어드민 MFA. [v2]

## 7. 데이터 파이프라인 (Ingest)

### 7.1 다중 학교 / 다중 AWS 계정

- 각 학교는 자기 AWS 계정에서 Kiro를 운영. `schools` 테이블에 학교당 한 행: `s3_bucket`, `s3_prefix`, `aws_region`, `role_arn`(있으면 cross-account AssumeRole, 없으면 우리 계정 직접 read).
- 학교 측이 만들어줘야 하는 IAM Role 신뢰관계 예시 — 우리 EC2 인스턴스 프로파일을 trusted entity로 등록, 권한은 `s3:ListBucket`/`s3:GetObject` 두 prefix 한정. (셋업 SOP는 §8에 첨부.)

### 7.2 갱신 주기 [✓ v1.0 — 단일 cron 통합]

Kiro CSV는 **매일 02:00 UTC에 정확히 1회만** 생성. v1.0 운영은 단일 cron 통합:

- **`kiro-daily.timer`** — 매일 **03:00 UTC (= 12:00 KST)** 한 번. Kiro 가 가끔 1~2분 늦으니 1시간 마진. 학생 페이지 안내 멘트 "정오 12:00 갱신" 과도 일관.
- 안에서 순서대로: `sync-identity-center` → `ingest` → `db-backup`. trap ERR 로 실패 단계 메일 알림, 정상 종료 시도 알림.
- ingest 는 `ingest_runs.status='ok'` 마킹 보고 멱등 skip — 같은 날 두 번 돌아도 데이터 중복 X.
- (운영 주의) 11~12시 KST 사이에 수동 ingest 돌리지 말 것. Kiro 파일 없는 상태에서 빈 처리 + ok 마킹 → 12시 cron 이 skip 함. 사고 시 `DELETE FROM ingest_runs WHERE date=...` 후 재실행.
- 옛 별도 cron (sync-identity 자정 / ingest 02:05) 은 통합으로 폐기. [v2 후보] ingest 코드 자체에서 rows=0 일 때 'no_data' 마킹으로 자연 재시도.

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

## 9. 인프라 / 배포 [✓ v1.0]

- **서버 1대 EC2** (현재 운영: 단일 인스턴스). 학교 50개 미만 규모까지 충분. [✓]
- 인스턴스 프로파일 `ec2-kiro-ingest-role` — S3 GetObject (Kiro raw) + PutObject (db-backups prefix 한정) + IAM Identity Center 조회. [✓]
- 설치: Docker (postgres + next), `nginx`, `certbot`. PostgreSQL 은 별도 설치가 아닌 Docker 컨테이너로 운영. [✓]
- systemd 유닛: `kiro-daily.timer` 단일 (sync + ingest + db-backup 통합). 매일 03:00 UTC. [✓]
- 백업: `pg_dump | gzip` → `s3://kiro-tbit/db-backups/` 30일 라이프사이클 자동 만료. [✓]
- 로그 회전: journald 기본. [✓]
- 모니터링 (UptimeRobot 등). [v2]

## 10. 향후 단계 (v1.0 이후)

**v1.1 (가까운 다음)**
- 공개 대시보드 학교 필터 칩 (`?school=<id>`) + 일별 추이 차트 (recharts 이미 의존성 있음).
- ingest 의 'no_data' 마킹 — rows=0 시 다음 cron 자연 재시도 (현재는 운영 규칙으로 회피).

**v2 (중기)**
- ~~AWS SES 마이그레이션~~ **[✓ v1.0]** — us-east-1 에서 도메인 verify, EC2 instance profile 권한.
- 어드민 MFA.
- 학생별 한도 상향 워크플로 — 어드민이 `overage_cap` 조정 → Kiro 콘솔 자동 적용 (Kiro API 노출 시점에).
- 슬랙/이메일 알림 (cron 실패는 이미 메일 알림 있음, 추가로 한도 80% 도달 등).
- 학생 알림 (랭킹 변동, 월간 챔피언 등).
- 학교 S3 EventBridge → SQS push 로 near-realtime 적재 옵션.
- `/admin/usage` — 임의 기간/학생 필터 CSV 다운로드.
- `/admin/logs` — audit_log 조회 UI.
- cross-account S3 실제 학교 합류 (현재 단일 TBIT 계정, `CROSS_ACCOUNT_S3.md` 참고).

**v3 (장기)**
- 본인 대시보드 + 학습 코칭 LLM (Kiro 활용 패턴 기반 피드백).

## 11. 열린 이슈 / 의사결정 필요

| # | 이슈 | 상태 |
| --- | --- | --- |
| 1 | ~~PUBLIC_SCHOOL_NAME~~ → 다중 학교 전환 | 완료 |
| 2 | ~~도메인~~ → `kiro.tbit.co.kr` | 완료 |
| 3 | ~~운영 서버 위치~~ → 클라우드(EC2) | 완료 |
| 4 | ~~"본인 행 하이라이트"~~ → 빼기로 결정 | 완료 |
| 5 | ~~학교 IdP~~ → IAM Identity Center 신규 (단일 TBIT 계정) | 완료 |
| 6 | ~~한도 상향 정책~~ → v2 연기 | 완료 |
| 7 | ~~첫 파일럿 학교~~ → 조선대학교 32명 / 광주대학교 71명 / TBIT 사내 4명 | 완료 |
| 8 | ~~학교 IT 가이드 PDF~~ → `public/guides/aws-connection-guide.pdf` 배포 | 완료 |
| 9 | 학생 비번 배포 → 실제 사용 시작 | **진행 중** |
| 10 | 모니터링 도구 도입 | **v2 결정 필요** |

## 12. 참고 자료

- Kiro 어드민 대시보드: <https://kiro.dev/docs/enterprise/monitor-and-track/dashboard/>
- 사용자별 활동 리포트: <https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/>
- AWS 공식 샘플 (Streamlit 기반, 동일 CSV 사용): <https://github.com/aws-samples/sample-kiro-user-analytics-dashboard>
