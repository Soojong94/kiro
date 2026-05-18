# 배포 가이드 — Ubuntu EC2 + Docker + nginx + Let's Encrypt

대상: `<server-ip>` (Ubuntu 22.04+), 도메인 `kiro-tbit.kro.kr`.

## 0. 사전 준비 (로컬 + AWS 콘솔)

**AWS Security Group**
- inbound TCP **22** (SSH) — 본인 IP 만 권장
- inbound TCP **80** (HTTP / Let's Encrypt 검증용)
- inbound TCP **443** (HTTPS)
- inbound TCP **3000** 은 닫아둠 — nginx 가 내부 프록시

**DNS**
- A 레코드: `kiro-tbit.kro.kr` → `<server-ip>`
- 전파 확인: `dig +short kiro-tbit.kro.kr` 가 IP 반환할 때까지 대기 (수 분 ~ 수 시간)

**Git 푸시** (로컬 윈도우, 마지막 커밋 시점 기준)
```powershell
git add .
git commit -m "deploy: prod docker + nginx + ssl + 20-school mock"
git push origin main   # 또는 master
```

---

## 1. 서버 접속 + 초기 셋업

```bash
ssh -i <your-key>.pem ubuntu@<server-ip>

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
cp .env.production.example .env
nano .env
```

채울 값:

| 키 | 값 |
|---|---|
| `DB_PASSWORD` | Postgres 비번 — 강한 랜덤 (예: `***REMOVED-DB-PW-EXAMPLE***`) |
| `ADMIN_BOOTSTRAP_PASSWORD` | 최초 어드민 비번 (생성 후 라인 삭제) |
| `SESSION_COOKIE_PASSWORD` | 32자+ 랜덤 (예: `***REMOVED-COOKIE-PW-EXAMPLE***`) |
| `AWS_ACCESS_KEY_ID` / `SECRET` | 로컬 `.env.local` 값 그대로 복사 |
| `APP_BASE_URL` | `https://kiro-tbit.kro.kr` (기본값 그대로) |
| `SMTP_*` / `EMAIL_FROM` | 기본값 그대로 (Gmail) |

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

## 4. 어드민 + 목업 데이터 시드

```bash
docker compose -f docker-compose.prod.yml exec next npm run bootstrap-admin
docker compose -f docker-compose.prod.yml exec next npm run seed-mock-full
```

시드 끝나면 `.env` 에서 `ADMIN_BOOTSTRAP_PASSWORD` 라인 삭제.

---

## 5. SSL 인증서 발급 (Let's Encrypt)

DNS 전파 확인:
```bash
dig +short kiro-tbit.kro.kr
# <server-ip> 가 떠야 함
```

서버에 nginx 가 80 포트로 응답하는지 확인:
```bash
curl -i http://kiro-tbit.kro.kr/healthz
# HTTP/1.1 200 OK + "ok" 가 떠야 함
```

인증서 발급 + HTTPS 자동 설정:
```bash
sudo ./ops/setup-ssl.sh
```

certbot 이 nginx 설정에 SSL 블록 + http→https 리다이렉트를 자동 추가합니다. 갱신은 systemd timer 로 자동 (확인: `systemctl status certbot.timer`).

---

## 6. 접속 확인

브라우저: **https://kiro-tbit.kro.kr**

- `/` → 학생 로그인 게이트
- `/login` → `snu.1` / `welcome1234` (목업 학생)
- `/admin/login` → `admin` / 본인이 설정한 비번

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

1. **인제스트 cron** — 내일 첫 Kiro CSV 떨어진 뒤 systemd timer 등록:
   ```
   /etc/systemd/system/kiro-ingest.service
   /etc/systemd/system/kiro-ingest.timer
   ```
2. **자동 백업** — `pg_dump` 일일 cron + S3 업로드
3. **로그 로테이션** — Docker logs json 크기 제한 (`docker-compose.prod.yml` 의 logging 옵션)
4. **모니터링** — UptimeRobot 등으로 `https://kiro-tbit.kro.kr/healthz` 폴링
