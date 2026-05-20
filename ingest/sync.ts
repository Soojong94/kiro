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
import type { Connection } from "@/lib/types";

// CSV 원본 보관 경로. 기본 1년 보관 (별도 cleanup 스크립트가 정리).
// 컨테이너 환경에선 volume mount: ./data/csv-archive → /data/csv-archive
const ARCHIVE_ROOT = process.env.CSV_ARCHIVE_DIR ?? "/data/csv-archive";

async function archiveCsv(
  conn: Connection,
  dateStr: string,
  key: string,
  buffer: Buffer,
): Promise<void> {
  // 디렉토리 구조: <root>/<connection_id>/<YYYY-MM-DD>/<original-filename>
  const filename = path.basename(key);
  const dir = path.join(ARCHIVE_ROOT, conn.id, dateStr);
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

  // S3 가 설정된 connection 만
  const { rows: connRows } = await pool.query<{
    id: string;
    name: string;
    aws_account_id: string | null;
    ic_instance_id: string | null;
    ic_region: string;
    s3_bucket: string | null;
    s3_prefix: string | null;
    s3_region: string;
    role_arn: string | null;
  }>(`SELECT * FROM connections WHERE s3_bucket IS NOT NULL`);

  if (connRows.length === 0) {
    console.warn("[sync] S3 설정된 connection 없음 — connections 테이블 확인");
    await pool.end();
    return;
  }

  // 이미 성공한 connection 은 건너뜀 (재시도 cron 대비)
  const { rows: done } = await pool.query<{ connection_id: string }>(
    `SELECT DISTINCT connection_id FROM ingest_runs WHERE date = $1 AND status = 'ok'`,
    [dateStr],
  );
  const doneSet = new Set(done.map((r) => r.connection_id));

  let failCount = 0;
  for (const r of connRows) {
    if (doneSet.has(r.id)) {
      console.log(`[sync] skip connection=${r.id} (already ok)`);
      continue;
    }
    const conn: Connection = {
      id: r.id,
      name: r.name,
      awsAccountId: r.aws_account_id ?? undefined,
      icInstanceId: r.ic_instance_id ?? undefined,
      icRegion: r.ic_region,
      s3Bucket: r.s3_bucket ?? undefined,
      s3Prefix: r.s3_prefix ?? undefined,
      s3Region: r.s3_region,
      roleArn: r.role_arn ?? undefined,
    };
    try {
      await ingestConnection(conn, targetDate, dateStr);
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

async function ingestConnection(
  conn: Connection,
  date: Date,
  dateStr: string,
): Promise<void> {
  // 실행 로그 시작 — ingest_runs 는 connection 단위
  const {
    rows: [{ id: runId }],
  } = await pool.query<{ id: number }>(
    `INSERT INTO ingest_runs (connection_id, date, status) VALUES ($1, $2, 'running') RETURNING id`,
    [conn.id, dateStr],
  );

  // user_id → 학생의 실제 school_id 매핑. IC sync 가 채운 students 테이블이 단일 진리원천.
  // 한 connection 의 IC 가 여러 학교 그룹을 호스팅하면 CSV 한 벌에 여러 학교 학생들이 섞여있음 —
  // 이 매핑으로 각 row 를 올바른 학교로 흘려보냄.
  const studentMap = new Map<string, string>();
  {
    const { rows: studentRows } = await pool.query<{
      user_id: string;
      school_id: string;
    }>(`SELECT user_id, school_id FROM students`);
    for (const r of studentRows) studentMap.set(r.user_id, r.school_id);
  }

  try {
    const files = await downloadCsvFiles(conn, date);
    if (files.length === 0) {
      console.warn(`[sync] connection=${conn.id} — CSV 파일 없음`);
    }

    let totalRows = 0;
    let orphanRows = 0;

    for (const { key, buffer } of files) {
      // 원본 CSV 로컬 아카이브 (실패해도 인제스트 자체는 계속)
      try {
        await archiveCsv(conn, dateStr, key, buffer);
      } catch (err) {
        console.warn(`[sync] archive 실패 (무시) connection=${conn.id} key=${key}:`, err);
      }

      const parsed = await parseCsv(buffer);

      // 파일 단위 트랜잭션
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const row of parsed) {
          const studentSchoolId = studentMap.get(row.userId);
          if (!studentSchoolId) {
            // students 에 없는 user_id — IC sync 가 아직 안 잡아갔거나, 빠져있는 사용자.
            // 다음 sync 이후 재인제스트하면 자동 흡수됨.
            orphanRows++;
            console.warn(
              `[sync] orphan user_id=${row.userId} (students 테이블 미존재) — skip`,
            );
            continue;
          }
          totalRows++;

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
              studentSchoolId,
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
              [dateStr, studentSchoolId, row.userId, model, count],
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

      console.log(
        `[sync] source=${conn.id} key=${key} rows=${parsed.length} (적재 ${totalRows}, orphan ${orphanRows})`,
      );
    }

    await pool.query(
      `UPDATE ingest_runs SET status='ok', rows=$1, ended_at=now() WHERE id=$2`,
      [totalRows, runId],
    );
    console.log(
      `[sync] source=${conn.id} date=${dateStr} 완료 적재=${totalRows} orphan=${orphanRows}`,
    );
  } catch (err) {
    await pool.query(
      `UPDATE ingest_runs SET status='error', error=$1, ended_at=now() WHERE id=$2`,
      [String(err), runId],
    );
    console.error(`[sync] source=${conn.id} 실패:`, err);
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
