# 배포 가이드 — Ubuntu EC2 + Docker + nginx + Let's Encrypt

대상: 운영 EC2 (Ubuntu 22.04+), 도메인 `kiro.tbit.co.kr`. 아래에서 `<server-ip>` 는 운영 서버 퍼블릭 IP, `<your-key>.pem` 은 SSH 키 파일로 치환.

## 0. 사전 준비 (로컬 + AWS 콘솔)

**AWS Security Group**
- inbound TCP **22** (SSH) — 본인 IP 만 권장
- inbound TCP **80** (HTTP / Let's Encrypt 검증용)
- inbound TCP **443** (HTTPS)
- inbound TCP **3000** 은 닫아둠 — nginx 가 내부 프록시

**DNS**
- A 레코드: `kiro.tbit.co.kr` → `<server-ip>`
- 전파 확인: `dig +short kiro.tbit.co.kr` 가 IP 반환할 때까지 대기 (수 분 ~ 수 시간)

**Git 푸시** (로컬에서 마지막 변경 커밋 후)
```powershell
git push origin master
```

---

## 1. 서버 접속 + 초기 셋업

```bash
ssh -i <your-key>.pem ubuntu@<server-ip>

# git 이 없는 fresh 이미지 대비
sudo apt-get update && sudo apt-get install -y git

# repo 클론 (private 이면 deploy key 또는 PAT 필요)
git clone https://github.com/Soojong94/kiro.git
cd kiro

# 줄바꿈 변환 (윈도우에서 만든 .sh 안전 처리)
sudo apt-get update && sudo apt-get install -y dos2unix
find ops -name "*.sh" -exec dos2unix {} \;

# Docker + nginx + certbot + fail2ban + 방화벽 + SSH 비번 로그인 일괄 설정
chmod +x ops/*.sh
sudo ./ops/server-setup.sh

# ubuntu 사용자 비번 (이후 비번 로그인용)
sudo passwd ubuntu

# docker 그룹 반영을 위해 재로그인
exit
ssh -i <your-key>.pem ubuntu@<server-ip>
cd kiro
```

---

## 2. 환경변수 (`.env`) 작성

```bash
cp .env.example .env
nano .env
```

채울 값 (모든 값은 새로 발급/생성하고, 절대 이 문서나 채팅에 붙여넣지 말 것):

| 키 | 값 |
|---|---|
| `DB_PASSWORD` | Postgres 비번 — `openssl rand -base64 24` |
| `ADMIN_BOOTSTRAP_PASSWORD` | 최초 어드민 비번 (생성 후 라인 삭제) |
| `SESSION_COOKIE_PASSWORD` | 32자 이상 랜덤 — `openssl rand -base64 32` |
| `AWS_ACCESS_KEY_ID` / `SECRET` | IAM 콘솔에서 새로 발급 (kiro-ingest 용) |
| `APP_BASE_URL` | `https://kiro.tbit.co.kr` |
| `SMTP_USER` / `SMTP_PASS` | Gmail 계정 + 앱 비밀번호 |
| `EMAIL_FROM` | `"Kiro 통합 랭킹 <noreply@example.com>"` 형태 |

저장 후:
```bash
chmod 600 .env
```

---

## 3. 컨테이너 빌드 + 가동

```bash
docker compose -f docker-compose.prod.yml up -d --build

# 진행 확인 (Ready in N ms 뜰 때까지)
docker compose -f docker-compose.prod.yml logs -f next
# 보고나면 Ctrl+C (컨테이너는 계속 실행됨)
```

---

## 4. DB 마이그레이션 적용

`db/schema.sql` 은 Postgres 컨테이너 최초 init 때만 자동 실행됨. 이후 추가된 마이그레이션은 **순서대로 수동 적용**.

```bash
# 운영 DB 에 적용 안 된 마이그레이션 확인 — 일단 전부 돌려도 안전 (모두 IF NOT EXISTS / 멱등)
for f in db/migrations/*.sql; do
  echo "── 적용: $f"
  docker exec -i kiro-pg psql -U kiro -d kiro < "$f"
done

# 스키마 확인
docker exec kiro-pg psql -U kiro -d kiro -c "\dt"
# connections / schools / students / daily_usage / ingest_runs / admins 등 다 떠야 함
```

> 마이그레이션 5개 (auth, password-reset, students-fk-restrict, schools-internal, connections, ingest-runs-connection, admin-password-age) 모두 적용 필수. 누락 시 학생 페이지 500 또는 ingest 실패.

---

## 5. 어드민 부트스트랩 + AWS 연결 등록 + 초기 sync

```bash
# 최초 super 어드민 1명 생성 (.env 의 ADMIN_BOOTSTRAP_PASSWORD 사용)
docker compose -f docker-compose.prod.yml exec next npm run bootstrap-admin
```

부트스트랩 끝나면 `.env` 에서 `ADMIN_BOOTSTRAP_PASSWORD` 라인 삭제 권장.

그 후 브라우저에서 `https://kiro.tbit.co.kr/admin/login` → 어드민 로그인 → **AWS 연결** 메뉴 → connection 1건 등록 (S3 + IC + role_arn). 자세한 절차는 `/admin/connections/guide`.

connection 등록 후 sync 1회:
```bash
docker compose -f docker-compose.prod.yml exec next npm run sync-identity-center
```

학생/학교 자동 import. 신규 학생 초기 비번은 `samples/credentials/*.csv` 에 출력.

---

## 6. SSL 인증서 발급 (Let's Encrypt)

DNS 전파 확인:
```bash
dig +short kiro.tbit.co.kr
# <server-ip> 가 떠야 함
```

서버에 nginx 가 80 포트로 응답하는지 확인:
```bash
curl -i http://kiro.tbit.co.kr/healthz
# HTTP/1.1 200 OK + "ok" 가 떠야 함
```

인증서 발급 + HTTPS 자동 설정:
```bash
sudo ./ops/setup-ssl.sh
```

certbot 이 nginx 설정에 SSL 블록 + http→https 리다이렉트를 자동 추가합니다. 갱신은 systemd timer 로 자동 (확인: `systemctl status certbot.timer`).

---

## 7. 접속 확인

브라우저: **https://kiro.tbit.co.kr**

- `/` → 학생 로그인 게이트
- `/login` → `sync-identity-center` 가 만든 학생 계정 + `samples/credentials/*.csv` 의 초기 비번
- `/admin/login` → `admin` / 본인이 설정한 비번

---

## 8. cron 자동화 (systemd timer)

매일 자동으로 IC sync + S3 ingest 돌도록:

```bash
# 시스템 디렉토리로 복사
sudo cp ops/systemd/kiro-sync-identity.{service,timer} /etc/systemd/system/
sudo cp ops/systemd/kiro-ingest.{service,timer} /etc/systemd/system/

# 권한 + reload
sudo systemctl daemon-reload

# 활성화 + 즉시 시작 (timer 만, service 는 timer 가 호출)
sudo systemctl enable --now kiro-sync-identity.timer kiro-ingest.timer

# 등록 확인 — 다음 실행 시각 표시
sudo systemctl list-timers kiro-*
```

스케줄:
- `kiro-sync-identity.timer` → 매일 **02:15 UTC** (11:15 KST) — IC 그룹/사용자 → schools/students
- `kiro-ingest.timer` → 매일 **02:30 UTC** (11:30 KST) — S3 CSV → daily_usage + 스냅샷

**운영 명령**:
```bash
# 수동 실행 (즉시 한 번)
sudo systemctl start kiro-sync-identity.service
sudo systemctl start kiro-ingest.service

# 최근 실행 로그
journalctl -u kiro-ingest.service -n 50
journalctl -u kiro-sync-identity.service -n 50

# 일시 중지
sudo systemctl stop kiro-ingest.timer
sudo systemctl disable kiro-ingest.timer  # 영구 중지
```

---

## 운영 명령

```bash
# 로그
docker compose -f docker-compose.prod.yml logs -f next

# 재시작
docker compose -f docker-compose.prod.yml restart next

# 코드 갱신 후 재배포
git pull
docker compose -f docker-compose.prod.yml up -d --build next

# DB 백업 (수동)
docker exec kiro-pg pg_dump -U kiro kiro > backup-$(date +%F).sql

# nginx 설정 변경 후 리로드
sudo nginx -t && sudo systemctl reload nginx

# 모든 서비스 정지 (데이터 유지)
docker compose -f docker-compose.prod.yml down

# 완전 초기화 (DB 통째로 날아감 — 위험)
docker compose -f docker-compose.prod.yml down -v
```

---

## 다음 단계 (선택)

1. **자동 백업** — `pg_dump` 일일 cron + S3 업로드
2. **로그 로테이션** — Docker logs json 크기 제한 (`docker-compose.prod.yml` 의 logging 옵션)
3. **모니터링** — UptimeRobot 등으로 `https://kiro.tbit.co.kr/healthz` 폴링
4. **AWS SES 마이그레이션** — 현재 Gmail SMTP. 운영 본격화 시 SES 도메인 verify 후 `lib/email.ts` 만 교체
