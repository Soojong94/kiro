// cron 진입점. 모든 학교의 S3 CSV를 pull → DB upsert → 스냅샷 갱신.
//
// 실행:
//   npm run ingest                      # 어제 일자
//   npm run ingest -- --date 2026-05-13 # 특정 날짜 재처리
//
// cron 예시 (매일 02:30 UTC = 11:30 KST):
//   30 2 * * * cd /opt/kiro && npm run ingest >> /var/log/kiro-ingest.log 2>&1

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/lib/db";
import { downloadCsvFiles } from "./s3";
import { parseCsv } from "./parse";
import { computeAndStoreSnapshots } from "./snapshot";
import type { School } from "@/lib/types";

// CSV 원본 보관 경로. 기본 1년 보관 (별도 cleanup 스크립트가 정리).
// 컨테이너 환경에선 volume mount: ./data/csv-archive → /data/csv-archive
const ARCHIVE_ROOT = process.env.CSV_ARCHIVE_DIR ?? "/data/csv-archive";

async function archiveCsv(
  school: School,
  dateStr: string,
  key: string,
  buffer: Buffer,
): Promise<void> {
  // 디렉토리 구조: <root>/<school_id>/<YYYY-MM-DD>/<original-filename>
  const filename = path.basename(key);
  const dir = path.join(ARCHIVE_ROOT, school.id, dateStr);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
}

async function main() {
  const dateArg = (() => {
    const i = process.argv.indexOf("--date");
    return i !== -1 ? process.argv[i + 1] : undefined;
  })();
  const targetDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : yesterday();
  const dateStr = targetDate.toISOString().slice(0, 10);

  console.log(`[sync] 시작 date=${dateStr}`);

  // S3가 설정된 학교만
  const { rows: schools } = await pool.query<{
    id: string;
    name: string;
    kind: string;
    aws_account_id: string | null;
    s3_bucket: string | null;
    s3_prefix: string | null;
    aws_region: string;
    role_arn: string | null;
  }>(`SELECT * FROM schools WHERE s3_bucket IS NOT NULL`);

  if (schools.length === 0) {
    console.warn("[sync] S3 설정된 학교 없음 — schools 테이블을 확인하세요");
    await pool.end();
    return;
  }

  // 이미 성공한 학교는 건너뜀 (재시도 cron 대비)
  const { rows: done } = await pool.query<{ school_id: string }>(
    `SELECT DISTINCT school_id FROM ingest_runs WHERE date = $1 AND status = 'ok'`,
    [dateStr],
  );
  const doneSet = new Set(done.map((r) => r.school_id));

  let failCount = 0;
  for (const s of schools) {
    if (doneSet.has(s.id)) {
      console.log(`[sync] skip school=${s.id} (already ok)`);
      continue;
    }
    const school: School = {
      id: s.id,
      name: s.name,
      kind: s.kind as School["kind"],
      awsAccountId: s.aws_account_id ?? undefined,
      s3Bucket: s.s3_bucket ?? undefined,
      s3Prefix: s.s3_prefix ?? undefined,
      awsRegion: s.aws_region,
      roleArn: s.role_arn ?? undefined,
    };
    try {
      await ingestSchool(school, targetDate, dateStr);
    } catch {
      failCount++;
    }
  }

  // 일부 실패해도 스냅샷 갱신 (현재 DB 데이터 기준으로)
  console.log(`[sync] 인제스트 완료 (실패 ${failCount}개) → 스냅샷 계산 시작`);
  await computeAndStoreSnapshots();

  await pool.end();
  console.log("[sync] 완료");
}

async function ingestSchool(
  school: School,
  date: Date,
  dateStr: string,
): Promise<void> {
  // 실행 로그 시작
  const {
    rows: [{ id: runId }],
  } = await pool.query<{ id: number }>(
    `INSERT INTO ingest_runs (school_id, date, status) VALUES ($1, $2, 'running') RETURNING id`,
    [school.id, dateStr],
  );

  try {
    const files = await downloadCsvFiles(school, date);
    if (files.length === 0) {
      console.warn(`[sync] school=${school.id} — CSV 파일 없음`);
    }

    let totalRows = 0;

    for (const { key, buffer } of files) {
      // 원본 CSV 로컬 아카이브 (실패해도 인제스트 자체는 계속)
      try {
        await archiveCsv(school, dateStr, key, buffer);
      } catch (err) {
        console.warn(`[sync] archive 실패 (무시) school=${school.id} key=${key}:`, err);
      }

      const parsed = await parseCsv(buffer);
      totalRows += parsed.length;

      // 파일 단위 트랜잭션
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const row of parsed) {
          await client.query(
            `INSERT INTO daily_usage
               (date, school_id, user_id, client_type, subscription_tier,
                total_messages, chat_conversations, credits_used, overage_credits_used)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (date, school_id, user_id, client_type) DO UPDATE SET
               subscription_tier    = EXCLUDED.subscription_tier,
               total_messages       = EXCLUDED.total_messages,
               chat_conversations   = EXCLUDED.chat_conversations,
               credits_used         = EXCLUDED.credits_used,
               overage_credits_used = EXCLUDED.overage_credits_used`,
            [
              dateStr,
              school.id,
              row.userId,
              row.clientType,
              row.subscriptionTier,
              row.totalMessages,
              row.chatConversations,
              row.creditsUsed,
              row.overageCreditsUsed,
            ],
          );

          for (const [model, count] of Object.entries(row.modelMessages)) {
            await client.query(
              `INSERT INTO model_usage (date, school_id, user_id, model_name, messages)
               VALUES ($1,$2,$3,$4,$5)
               ON CONFLICT (date, school_id, user_id, model_name) DO UPDATE
                 SET messages = EXCLUDED.messages`,
              [dateStr, school.id, row.userId, model, count],
            );
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      console.log(`[sync] school=${school.id} key=${key} rows=${parsed.length}`);
    }

    await pool.query(
      `UPDATE ingest_runs SET status='ok', rows=$1, ended_at=now() WHERE id=$2`,
      [totalRows, runId],
    );
    console.log(`[sync] school=${school.id} date=${dateStr} 완료 total=${totalRows}`);
  } catch (err) {
    await pool.query(
      `UPDATE ingest_runs SET status='error', error=$1, ended_at=now() WHERE id=$2`,
      [String(err), runId],
    );
    console.error(`[sync] school=${school.id} 실패:`, err);
    throw err;
  }
}

function yesterday(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

main().catch((err) => {
  console.error("[sync] fatal:", err);
  process.exit(1);
});
