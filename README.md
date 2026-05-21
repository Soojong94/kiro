# Kiro 통합 랭킹 대시보드

회사가 학교/조직에 제공한 **AWS Kiro** 사용 현황을 학생 단위로 집계해 공정하고 가시적인 랭킹을 제공하는 웹 서비스. 학생은 본인 위치를 즉시 확인하고, 운영자(TBIT 및 각 학교 어드민)는 조직별 활용도와 학생별 활동을 한눈에 본다.

**상태**: v1.0 운영 중 (kiro.tbit.co.kr)

## 핵심 동작

```
AWS IAM Identity Center               Kiro Console
  └─ 그룹/사용자                       └─ user activity report → S3
            │                                     │  매일 02:00 UTC CSV 발행
            ▼                                     ▼
       매일 12:00 KST (= 03:00 UTC) kiro-daily.timer
            │
            ├─ sync-identity-center    →  schools / students 자동 등록
            ├─ ingest                  →  S3 CSV → daily_usage / model_usage + 스냅샷
            └─ db-backup               →  pg_dump → S3 (30일 보존)
                              ↓
                         PostgreSQL
                              ↓
                         Next.js SSR
                          ├─ /          학생 랭킹 (로그인, 마스킹)
                          ├─ /leave     본인 탈퇴 (소프트, 어드민 복구)
                          └─ /admin     RBAC (super / school)
                              ↓
                         nginx + Let's Encrypt
```

학생 계정은 IAM Identity Center 의 그룹/사용자를 그대로 import. 학교 어드민이 학생을 수기 등록할 필요 없음 (Kiro 미사용 뷰어 계정만 예외).

## 기술 스택

- **프레임워크**: Next.js 16 (App Router, Turbopack) + TypeScript + React 19
- **UI**: Tailwind CSS v4, Toss 톤 (라이트 베이스, Pretendard)
- **DB**: PostgreSQL 16 (마이그레이션 010 까지 적용)
- **인증**: Argon2id 해시 + iron-session (학생 / 어드민 분리)
- **인프라**: Docker Compose + nginx + Let's Encrypt + systemd timer
- **클라우드**: AWS (EC2 instance profile / S3 인제스트 / IAM Identity Center 동기화)

## 시작하기 (로컬)

전제: Docker Desktop 실행 중.

```bash
# 1. 환경변수 준비
cp .env.example .env.local
# .env.local 의 SESSION_COOKIE_PASSWORD, ADMIN_BOOTSTRAP_PASSWORD, AWS_*, EMAIL_FROM 등 채우기

# 2. 컨테이너 기동
docker compose up -d

# 3. 마이그레이션 일괄 적용
for f in db/migrations/*.sql; do
  docker exec -i kiro-pg psql -U kiro -d kiro < "$f"
done

# 4. 어드민 부트스트랩 (1회)
docker exec kiro-next npm run bootstrap-admin

# 5. (선택) Identity Center 에서 학생 import
docker exec kiro-next npm run sync-identity-center

# → http://localhost:3000          (학생 페이지)
# → http://localhost:3000/admin    (어드민)
```

## 자주 쓰는 명령

| 명령 | 용도 |
|---|---|
| `docker exec kiro-next npm run ingest` | S3 에서 어제 CSV 가져와 DB 적재 |
| `docker exec kiro-next npm run sync-identity-center` | IC → schools/students 동기화 |
| `docker exec kiro-next npm run bootstrap-admin` | 최초 super 어드민 생성 |
| `docker exec kiro-next npm run reset-initial-passwords` | TBIT 외 학교 학생 비번 일괄 재발급 |
| `docker exec kiro-next npm run check-s3` | S3 접근 검증 |
| `docker exec kiro-next npm run check-ses` | AWS SES 권한/region 검증 |
| `docker exec kiro-next npm run typecheck` | tsc --noEmit |

## 디렉토리 구조

```
app/                    Next.js (App Router)
  page.tsx              학생 공개 랭킹
  champions/            월별 챔피언
  leave/                학생 본인 탈퇴 (소프트)
  logout-deactivated/   탈퇴 학생 다른 디바이스 세션 정리 route
  admin/                어드민 영역 (RBAC: super / school)
  login/, change-password/
components/             UI 컴포넌트
lib/
  db.ts                 pg 단일 풀
  db-data.ts            랭킹/스냅샷 로더
  ranking.ts            랭킹/KPI 집계
  auth.ts               iron-session + Argon2id
  student-auth.ts       학생 세션 + requireActiveStudent 가드
  student-recovery.ts   비번 재설정 토큰
  email.ts              AWS SES
  mask.ts               학생명 마스킹
ingest/
  s3.ts                 S3 + STS AssumeRole
  parse.ts              Kiro CSV 파서
  sync.ts               cron 진입
  snapshot.ts           ranking/kpi/champion 스냅샷
scripts/
  bootstrap-admin.ts
  sync-identity-center.ts
  reset-initial-passwords.ts
  backfill-initial-passwords.ts
  check-*.ts            진단 유틸 (s3, smtp, identity-center)
db/
  schema.sql            초기 스키마
  migrations/           점진 변경 (현재 010 까지)
ops/
  daily-cron.sh         systemd 가 호출하는 3단계 (sync + ingest + db-backup)
  systemd/              kiro-daily.{service,timer}
  nginx-kiro.conf       nginx 리버스 프록시
  setup-ssl.sh, server-setup.sh, cleanup-archive.sh
docs/
  data-flow.drawio      구조도 (drawio + pdf + jpg)
samples/credentials/    sync 가 생성한 학생 초기 비번 CSV (gitignored)
```

## 보안 / 운영 원칙

- 학생 실명은 **공개 응답에 절대 포함 금지** — `lib/mask.ts` 거친 값만 (`김*준`)
- 사내 학교 (`schools.is_internal = true`) 는 학생 공개 페이지에서 완전 제외
- 학생 탈퇴 = `deactivated_at` 마킹 (소프트). 로그인만 차단, 데이터/랭킹 노출 그대로
- 어드민이 복구 가능 (`UPDATE deactivated_at = NULL`)
- S3 원본 CSV 는 730일 라이프사이클 자동 만료 (Kiro raw)
- DB 백업: pg_dump → S3 `db-backups/` 30일 자동 만료
- 세션 쿠키: `httpOnly`, `secure`, `sameSite=lax`. 학생 7일, 어드민 8시간

## 더 보기

- [`PRD.md`](PRD.md) — 제품 요구사항 (v1.0 구현 태그 포함)
- [`CLAUDE.md`](CLAUDE.md) — 코드 컨벤션 / 작업 가이드
- [`DEPLOY.md`](DEPLOY.md) — 최초 배포 절차
- [`CROSS_ACCOUNT_S3.md`](CROSS_ACCOUNT_S3.md) — 새 학교 (별도 AWS 계정) 온보딩 (v1.0 미사용)
- `docs/data-flow.drawio` — 데이터 흐름 다이어그램
- `docs/private/OPERATIONS.md` — 운영 매뉴얼 (로컬 전용, git 제외)
