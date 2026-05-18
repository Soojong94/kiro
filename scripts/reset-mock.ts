// 테스트 mock 데이터 일괄 정리 — super 어드민만 남기고 모두 삭제.
// 실제 운영 데이터가 들어간 후엔 절대 실행 금지.
//
// 실행: npm run reset-mock
//
// 보존: super 어드민 (id, password_hash, role)
// 삭제: students, schools, daily_usage, model_usage, snapshots, ingest_runs,
//       password_reset_tokens, audit_log, school 어드민

import { pool } from "@/lib/db";

async function main() {
  console.log("[reset-mock] 시작 — super 어드민 외 모두 삭제\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 외래키 의존 순서 (child → parent)
    const tables = [
      "password_reset_tokens",
      "monthly_champion_snapshot",
      "ranking_snapshot",
      "kpi_snapshot",
      "model_usage",
      "daily_usage",
      "ingest_runs",
      "students",
      "audit_log",
    ];

    for (const t of tables) {
      const { rowCount } = await client.query(`DELETE FROM ${t}`);
      console.log(`  ${t.padEnd(28)} ${rowCount ?? 0} 행 삭제`);
    }

    // school 어드민은 schools 참조라 먼저 제거
    const { rowCount: schoolAdmins } = await client.query(
      `DELETE FROM admins WHERE role = 'school'`,
    );
    console.log(`  ${"admins (role=school)".padEnd(28)} ${schoolAdmins ?? 0} 행 삭제`);

    // 학교는 그 다음
    const { rowCount: schools } = await client.query(`DELETE FROM schools`);
    console.log(`  ${"schools".padEnd(28)} ${schools ?? 0} 행 삭제`);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // 남은 것 확인
  const { rows: remaining } = await pool.query<{
    id: number;
    username: string;
    role: string;
  }>(`SELECT id, username, role FROM admins ORDER BY id`);
  console.log("\n[reset-mock] 보존된 어드민:");
  for (const r of remaining) {
    console.log(`  - id=${r.id} username=${r.username} role=${r.role}`);
  }

  console.log("\n[reset-mock] ✅ 완료. 깨끗한 상태로 super 로그인부터 시작하세요.");
  await pool.end();
}

main().catch((err) => {
  console.error("[reset-mock] 실패:", err);
  process.exit(1);
});
