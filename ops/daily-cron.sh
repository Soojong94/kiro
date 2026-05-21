#!/usr/bin/env bash
# Kiro 일일 cron — sync → ingest. 실패 시 알림, 성공 시도 알림.
# DB 백업은 별도 운영 안 함 (EBS 스냅샷 / 수동 pg_dump 정책에 맡김).
set -euo pipefail
set -o errtrace

EMAIL="sujjong456@gmail.com"
STEP="init"

send_mail() {
  local subject="$1"
  local body="$2"
  docker compose -f /home/ubuntu/kiro/docker-compose.prod.yml exec -T next node -e "
    const nm = require('nodemailer');
    const t = nm.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT||587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    t.sendMail({
      from: process.env.EMAIL_FROM,
      to: '$EMAIL',
      subject: process.argv[1],
      text: process.argv[2]
    }).then(()=>console.log('mail sent'))
      .catch(e=>console.error('mail fail:', e.message));
  " "$subject" "$body" 2>&1 || echo "[$(date)] 메일 발송 실패"
}

notify_failure() {
  local exit_code=$?
  local now
  now=$(date -u +%FT%H%M%SZ)
  send_mail \
    "⚠ Kiro daily cron 실패: $STEP (exit $exit_code)" \
    "단계: $STEP
종료 코드: $exit_code
시각: $now UTC

서버 SSH 접속 후 로그 확인:
  journalctl -u kiro-daily.service -n 100 --no-pager

재실행:
  sudo systemctl start kiro-daily.service"
  exit $exit_code
}
trap notify_failure ERR

cd /home/ubuntu/kiro

STEP="sync-identity-center"
echo "[daily] [$(date -u +%FT%H%M%SZ)] $STEP 시작"
docker compose -f docker-compose.prod.yml exec -T next npm run sync-identity-center

STEP="ingest"
echo "[daily] [$(date -u +%FT%H%M%SZ)] $STEP 시작"
docker compose -f docker-compose.prod.yml exec -T next npm run ingest

NOW=$(date -u +%FT%H%M%SZ)
echo "[daily] [$NOW] ✅ 완료"

# 실패 trap 해제 (성공 알림 메일 자체 실패해도 cron 실패로 처리 X)
trap - ERR

send_mail \
  "✅ Kiro daily cron 성공" \
  "시각: $NOW UTC

단계별 정상 완료:
  1. sync-identity-center
  2. ingest

상세 로그:
  journalctl -u kiro-daily.service -n 100 --no-pager" || true
