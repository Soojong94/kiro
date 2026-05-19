// 로컬에 받아둔 Kiro CSV 한 파일을 파서로 통과시켜 daily_usage 에 적재.
// 학교 매핑: students 테이블에서 user_id → school_id 룩업.
// 매핑 없는 user_id 는 'unmapped' 로 표시 (DB 에 안 들어감, 콘솔에만 출력).
//
// 실행:
//   npm run test-ingest-local -- ./samples/raw/2026-05-18/KIRO_WEB_..._user_report_...csv
//
// 운영 인제스트 (sync.ts) 는 추후 동일 로직으로 리팩토링 예정 — 지금은 dry-run 용도.

import { readFile } from "node:fs/promises";
import { parseCsv } from "../ingest/parse";
import { pool } from "@/lib/db";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("사용: npm run test-ingest-local -- <CSV 파일 경로>");
    process.exit(1);
  }

  console.log(`[test-ingest] 파일: ${filePath}`);
  const buffer = await readFile(filePath);
  const parsed = await parseCsv(buffer);
  console.log(`[test-ingest] 파싱된 행: ${parsed.length}`);

  if (parsed.length === 0) {
    console.log("[test-ingest] 빈 파일 — 종료");
    await pool.end();
    return;
  }

  // 미리보기
  console.log("\n[샘플 행]");
  const first = parsed[0];
  console.log(`  Date            : ${first.date}`);
  console.log(`  UserId          : ${first.userId}`);
  console.log(`  Client_Type     : ${first.clientType}`);
  console.log(`  Subscription    : ${first.subscriptionTier}`);
  console.log(`  Total_Messages  : ${first.totalMessages}`);
  console.log(`  Credits_Used    : ${first.creditsUsed}`);
  console.log(`  Overage_Cap     : ${first.overageCap}`);
  console.log(`  ProfileId       : ${first.profileId.slice(0, 60)}...`);
  console.log(`  New_User        : ${first.newUser}`);
  console.log(`  modelMessages   : ${JSON.stringify(first.modelMessages)}`);

  // students 테이블에서 user_id → school_id 매핑
  const { rows: studentRows } = await pool.query<{
    school_id: string;
    user_id: string;
    real_name: string;
  }>(`SELECT school_id, user_id, real_name FROM students`);
  const userToSchool = new Map(studentRows.map((r) => [r.user_id, r]));
  console.log(`\n[test-ingest] 학생 테이블 ${userToSchool.size}명 로드`);

  // 적재
  let inserted = 0;
  const unmapped: string[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of parsed) {
      const student = userToSchool.get(row.userId);
      if (!student) {
        unmapped.push(row.userId);
        continue;
      }
      const dateStr = row.date ?? new Date().toISOString().slice(0, 10);

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
          student.school_id,
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
          [dateStr, student.school_id, row.userId, model, count],
        );
      }
      inserted++;
      console.log(
        `  + ${row.userId.slice(0, 18)}... → school=${student.school_id}, name=${student.real_name}, credits=${row.creditsUsed}`,
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("\n──────────────────────────────────────────────────────────");
  console.log(`✅ ${inserted}건 daily_usage 적재 완료`);
  if (unmapped.length > 0) {
    console.log(`⚠ 미매핑 ${unmapped.length}건 (students 에 user_id 없음):`);
    for (const uid of unmapped) console.log(`   - ${uid}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[test-ingest] 실패:", err);
  process.exit(1);
});
