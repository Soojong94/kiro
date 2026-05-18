#!/usr/bin/env bash
# kiro-tbit.kro.kr 도메인 → Let's Encrypt 인증서 발급 + nginx HTTPS 활성화.
#
# 사전 조건:
#   1) DNS A 레코드: kiro-tbit.kro.kr → <server-ip> (전파 확인 필요)
#   2) nginx 가 설치되어 있고 sites-enabled/kiro 가 활성화되어 80 포트 응답 중
#   3) AWS Security Group 80 + 443 inbound 허용
#
# 사용: sudo ./ops/setup-ssl.sh

set -euo pipefail

DOMAIN="kiro-tbit.kro.kr"
EMAIL="oksk@tbit.co.kr"

echo "[ssl] DNS 전파 확인 — $DOMAIN"
RESOLVED=$(dig +short "$DOMAIN" | head -1 || true)
if [ -z "$RESOLVED" ]; then
  echo "[ssl] ⚠ DNS 가 아직 안 풀림. A 레코드 전파 대기 후 재실행."
  exit 1
fi
echo "[ssl] DNS → $RESOLVED"

echo "[ssl] nginx HTTP 응답 확인…"
if ! curl -sSf -o /dev/null "http://$DOMAIN/healthz"; then
  echo "[ssl] ⚠ http://$DOMAIN/healthz 응답 없음 — nginx 설정 확인"
  exit 1
fi
echo "[ssl] ✓ HTTP 응답 정상"

echo "[ssl] certbot 으로 인증서 발급 + nginx 자동 설정…"
certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --redirect \
  --no-eff-email

echo ""
echo "──────────────────────────────────────────────────────────"
echo "[ssl] ✅ HTTPS 적용 완료"
echo "  - https://$DOMAIN 접속 확인"
echo "  - http:// 는 자동으로 https:// 로 리다이렉트"
echo "  - 인증서 자동 갱신: systemctl status certbot.timer"
echo "──────────────────────────────────────────────────────────"
