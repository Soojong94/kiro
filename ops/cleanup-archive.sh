#!/usr/bin/env bash
# CSV 아카이브 정리 — 365일 경과 파일 삭제.
# 시스템 cron 으로 매일 1회 실행 권장.
#
# 설치 예 (서버에서 1회):
#   sudo cp ops/cleanup-archive.sh /usr/local/bin/kiro-cleanup-archive
#   sudo chmod +x /usr/local/bin/kiro-cleanup-archive
#   sudo crontab -e
#     # 매일 03:30 UTC (인제스트 03:00 끝난 뒤) 실행
#     30 3 * * * /usr/local/bin/kiro-cleanup-archive

set -euo pipefail

ARCHIVE_DIR="${CSV_ARCHIVE_DIR:-/home/ubuntu/kiro/data/csv-archive}"
RETENTION_DAYS="${ARCHIVE_RETENTION_DAYS:-365}"

if [ ! -d "$ARCHIVE_DIR" ]; then
  echo "[cleanup-archive] $ARCHIVE_DIR 없음 — 종료"
  exit 0
fi

echo "[cleanup-archive] $RETENTION_DAYS 일 경과 파일 삭제 — $ARCHIVE_DIR"

# 365일 경과 파일 삭제
find "$ARCHIVE_DIR" -type f -mtime "+$RETENTION_DAYS" -print -delete

# 빈 디렉토리 정리
find "$ARCHIVE_DIR" -type d -empty -mindepth 1 -print -delete

echo "[cleanup-archive] 완료"
