# 최초 배포 가이드 — Ubuntu EC2 + Docker + nginx + Let's Encrypt

대상: 운영 EC2 (Ubuntu 22.04+), 도메인 `kiro.tbit.co.kr`. 일상 운영 명령은 `docs/private/OPERATIONS.md` (로컬) 참조.

`<server-ip>` = 운영 서버 퍼블릭 IP, `<your-key>.pem` = SSH 키.

## 0. 사전 준비

**AWS Security Group**
- inbound TCP **22** (SSH) — 본인 IP 만 권장
- inbound TCP **80** (HTTP / Let's Encrypt 검증용)
- inbound TCP **443** (HTTPS)
- inbound TCP **3000** 은 닫아둠 — nginx 가 내부 프록시

**EC2 인스턴스 프로파일 (IAM Role)** — `ec2-kiro-ingest-role`
- `s3:GetObject`, `s3:ListBucket` on Kiro raw CSV 버킷/prefix
- `s3:PutObject` on `kiro-tbit/db-backups/*` (DB 백업용, prefix 한정 최소 권한)
- IAM Identity Center 그룹/사용자 조회 권한

**DNS**
- A 레코드: `kiro.tbit.co.kr` → `<server-ip>`
- 전파 확인: `dig +short kiro.tbit.co.kr`

**Git 푸시** (로컬에서 마지막 변경 커밋 후)
```powershell
git push origin master
```

---

## 1. 서버 접속 + 초기 셋업

```bash
ssh -i <your-key>.pem ubuntu@<server-ip>

sudo apt-get update && sudo apt-get install -y git

git clone https://github.com/Soojong94/kiro.git
cd kiro

# 줄바꿈 변환 (윈도우에서 만든 .sh 안전 처리)
sudo apt-get install -y dos2unix
find ops -name "*.sh" -exec dos2unix {} \;

# Docker + nginx + certbot + fail2ban + 방화벽 + SSH 비번 로그인 일괄 설정
chmod +x ops/*.sh
sudo ./ops/server-setup.sh

sudo passwd ubuntu  # 이후 비번 로그인용

# docker 그룹 반영을 위해 재로그인
exit
ssh -i <your-key>.pem ubuntu@<server-ip>
cd kiro
```

---

## 2. 환경변수 (`.env`)

```bash
cp .env.example .env
nano .env
```

채울 값 (모든 값 새로 발급, 절대 문서/채팅에 붙이지 말 것):

| 키 | 값 |
|---|---|
| `DB_PASSWORD` | `openssl rand -base64 24` |
| `ADMIN_BOOTSTRAP_PASSWORD` | 최초 어드민 비번 (생성 후 라인 삭제) |
| `SESSION_COOKIE_PASSWORD` | `openssl rand -base64 32` |
| `APP_BASE_URL` | `https://kiro.tbit.co.kr` |
| `SES_REGION` | SES 도메인 verify 한 region (현재 `us-east-1`) |
| `EMAIL_FROM` | `"Kiro 통합 랭킹 <noreply@example.com>"` |
| `AWS_REGION` | `ap-northeast-2` |
| `TZ` | `Asia/Seoul` |

AWS 자격증명 키 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) 는 **넣지 않음** — EC2 instance profile 이 자동 제공.

```bash
chmod 600 .env
```

---

## 3. 컨테이너 빌드 + 가동

```bash
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml logs -f next
# "Ready in N ms" 뜨면 Ctrl+C
```

---

## 4. DB 마이그레이션 적용

`db/schema.sql` 은 Postgres 컨테이너 최초 init 때만 자동 실행. 이후 마이그레이션은 **순서대로 수동 적용**.

```bash
for f in db/migrations/*.sql; do
  echo "── 적용: $f"
  docker exec -i kiro-pg psql -U kiro -d kiro < "$f"
done

docker exec kiro-pg psql -U kiro -d kiro -c "\dt"
# 13개 테이블 떠야 함 (admins, audit_log, connections, daily_usage, ingest_runs,
# kpi_snapshot, model_usage, monthly_champion_snapshot, password_reset_tokens,
# quota_overrides, ranking_snapshot, schools, students)
```

> 010 까지 모든 마이그레이션 적용 필수. 누락 시 학생 페이지 500.

---

## 5. 어드민 부트스트랩 + Connection 등록 + 초기 sync

```bash
docker compose -f docker-compose.prod.yml exec next npm run bootstrap-admin
```

끝나면 `.env` 의 `ADMIN_BOOTSTRAP_PASSWORD` 라인 삭제.

브라우저에서 `https://kiro.tbit.co.kr/admin/login` → 로그인 → **AWS 연결** 메뉴 → connection 1건 등록 (S3 + IC + 필요 시 role_arn). 자세한 절차는 `/admin/connections/guide`.

```bash
docker compose -f docker-compose.prod.yml exec next npm run sync-identity-center
```

학생/학교 자동 import. 신규 학생 초기 비번은 `samples/credentials/*.csv` 출력. 어드민 → 학생 페이지의 "🔑 초기 비밀번호 일괄 다운로드" 에서도 CSV 받을 수 있음.

---

## 6. SSL 인증서 발급 (Let's Encrypt)

```bash
dig +short kiro.tbit.co.kr           # <server-ip> 떠야 함
curl -i http://kiro.tbit.co.kr/healthz  # HTTP 200 "ok"

sudo ./ops/setup-ssl.sh
```

certbot 이 nginx 에 SSL 블록 + http→https 리다이렉트 자동 추가. 갱신은 systemd timer 자동 (`systemctl status certbot.timer`).

---

## 7. 접속 확인

브라우저: **https://kiro.tbit.co.kr**

- `/` → 학생 로그인 게이트
- `/login` → `sync-identity-center` 가 만든 학생 계정 + `samples/credentials/*.csv` 의 초기 비번
- `/admin/login` → `admin` / 본인 설정 비번

---

## 8. cron 자동화 (systemd timer)

`kiro-daily.timer` 하나만 사용. 매일 12:00 KST 에 sync + ingest + db-backup 통합 실행.

```bash
# 시스템 디렉토리로 복사
sudo cp ops/systemd/kiro-daily.{service,timer} /etc/systemd/system/

# reload + 활성화 + 즉시 시작
sudo systemctl daemon-reload
sudo systemctl enable --now kiro-daily.timer

# 다음 실행 시각 확인
systemctl list-timers kiro-*
# kiro-daily.timer → Fri YYYY-MM-DD 03:00:00 UTC (= 다음날 12:00 KST)
```

옛 분리 유닛 (`kiro-ingest`, `kiro-sync-identity`) 은 사용 안 함. 시스템에 남아있으면 disable + 파일 삭제.

**bind mount 디렉토리** 미리 만들기 (없으면 docker compose 가 못 mount):
```bash
mkdir -p ~/kiro/samples/credentials ~/kiro/data/csv-archive ~/kiro/public/guides
```

---

## 9. S3 라이프사이클 + IAM 정책 (콘솔)

운영 안정성을 위해 콘솔에서 다음 설정:

**버킷 `kiro-tbit` 라이프사이클 규칙**
- prefix `db-backups/` → 30일 후 객체 만료
- prefix `tbit_kiro_test/AWSLogs/...` → 730일 후 객체 만료
- (전체) → 완료되지 않은 멀티파트 7일 후 정리

**IAM Role `ec2-kiro-ingest-role` 인라인 정책 `kiro-db-backup-write`**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowDbBackupWrite",
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::kiro-tbit/db-backups/*"
  }]
}
```

DeleteObject 는 의도적으로 미부여 — 라이프사이클이 처리.

---

## 일상 운영

대부분의 일상 명령 (로그 보기, 백필, 진단 등) 은 **`docs/private/OPERATIONS.md` 참조** (gitignored, 로컬 전용).

핵심만:
```bash
# 코드 갱신 + 재배포
cd ~/kiro && git pull
docker compose -f docker-compose.prod.yml up -d --build next

# 마이그레이션 추가 시
docker exec -i kiro-pg psql -U kiro -d kiro < db/migrations/0XX-name.sql

# systemd 유닛 변경 시
sudo cp ops/systemd/kiro-daily.* /etc/systemd/system/
sudo systemctl daemon-reload

# cron 로그
journalctl -u kiro-daily.service -n 100 --no-pager
```

---

## 다음 단계 (v2 후보)

- **모니터링** — UptimeRobot 등으로 `https://kiro.tbit.co.kr/healthz` 폴링
- **모니터링** — UptimeRobot 등 외부 폴링
- **어드민 MFA**
- **학생 알림** (랭킹 변동 메일)
