#!/usr/bin/env bash
# Ubuntu 22/24 EC2 신규 서버 1회 셋업 — Docker + nginx + certbot + SSH 비번 로그인 + fail2ban.
#
# 사용:
#   chmod +x ops/server-setup.sh
#   sudo ./ops/server-setup.sh

set -euo pipefail

echo "[setup] apt 업데이트…"
apt-get update -y
apt-get upgrade -y

echo "[setup] 기본 도구 + fail2ban + nginx + certbot"
apt-get install -y \
  curl ca-certificates gnupg ufw fail2ban \
  nginx \
  certbot python3-certbot-nginx \
  dnsutils

# ── Docker 설치 (공식 저장소) ─────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "[setup] Docker 설치…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  usermod -aG docker ubuntu
  echo "[setup] ✓ Docker 설치 완료 (ubuntu 사용자 그룹 추가됨 — 재로그인 필요)"
else
  echo "[setup] Docker 이미 설치됨"
fi

# ── 방화벽 (ufw) ────────────────────────────────────────────────
echo "[setup] 방화벽 규칙 (ufw)"
ufw allow 22/tcp  comment "SSH"
ufw allow 80/tcp  comment "HTTP (certbot + nginx)"
ufw allow 443/tcp comment "HTTPS"
ufw --force enable
ufw status verbose

# ── SSH 비밀번호 로그인 활성화 ─────────────────────────────────
echo ""
echo "[setup] SSH 비밀번호 로그인 활성화"
SSHD=/etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication yes/' "$SSHD"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "$SSHD"

CLOUD_INIT_SSH=/etc/ssh/sshd_config.d/60-cloudimg-settings.conf
if [ -f "$CLOUD_INIT_SSH" ]; then
  sed -i 's/^PasswordAuthentication.*/PasswordAuthentication yes/' "$CLOUD_INIT_SSH"
fi

systemctl restart ssh
echo "[setup] ✓ SSH 비밀번호 로그인 ON. ubuntu 비번 설정: sudo passwd ubuntu"

# ── fail2ban (SSH brute-force 방어) ─────────────────────────────
systemctl enable --now fail2ban

# ── nginx 사이트 설정 ──────────────────────────────────────────
echo "[setup] nginx 사이트 (kiro)"
# 이 스크립트는 프로젝트 루트에서 실행됨 (sudo ./ops/server-setup.sh)
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cp "$PROJECT_DIR/ops/nginx-kiro.conf" /etc/nginx/sites-available/kiro
ln -sf /etc/nginx/sites-available/kiro /etc/nginx/sites-enabled/kiro
# 기본 사이트는 제거 (도메인 미일치 응답 방지)
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
systemctl enable nginx

echo ""
echo "──────────────────────────────────────────────────────────"
echo "  서버 셋업 완료"
echo "──────────────────────────────────────────────────────────"
echo "  다음 단계:"
echo "    1) sudo passwd ubuntu                              # SSH 비번 설정"
echo "    2) DNS 전파 확인: dig +short ***REMOVED-BUCKET***.kro.kr"
echo "    3) exit + 재로그인                                  # docker 그룹 반영"
echo "    4) cp .env.production.example .env && vi .env       # 시크릿 채우기"
echo "    5) docker compose -f docker-compose.prod.yml up -d --build"
echo "    6) sudo ./ops/setup-ssl.sh                          # Let's Encrypt 인증서"
echo "──────────────────────────────────────────────────────────"
