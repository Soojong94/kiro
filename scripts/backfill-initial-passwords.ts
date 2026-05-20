// 일회성 백필 — samples/credentials/*.csv 의 초기 비번을 students.initial_password 로 복원.
//
// 사용 시점:
//   마이그레이션 009 적용 후, 옛 sync 코드로 INSERT 된 학생들이 initial_password=NULL 인 상태.
//   이 스크립트가 그 학생들의 (school_id, username) 매칭으로 plaintext 채워줌.
//
// 안전성:
//   - WHERE initial_password IS NULL 가드 — 이미 채워진 값은 절대 안 건드림.
//   - password_hash 도 안 건드림 — 로그인 동작에 영향 0.
//
// 실행: docker exec kiro-next npm run backfill-initial-passwords

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@/lib/db";

const CSV_DIR = "./samples/credentials";

interface Row {
  school_id: string;
  username: string;
  real_name: string;
  email: string;
  initial_password: string;
}

// 간이 CSV 파서 (sync-identity-center 가 만드는 형식 한정 — 따옴표/이스케이프 약식 지원).
function parseCsv(text: string): Row[] {
  // BOM 제거
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = {
    school_id: header.indexOf("school_id"),
    username: header.indexOf("username"),
    real_name: header.indexOf("real_name"),
    email: header.indexOf("email"),
    initial_password: header.indexOf("initial_password"),
  };
  if (Object.values(idx).some((i) => i === -1)) {
    throw new Error(`CSV 헤더 누락: ${lines[0]}`);
  }

  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells.length < header.length) continue;
    rows.push({
      school_id: cells[idx.school_id],
      username: cells[idx.username],
      real_name: cells[idx.real_name],
      email: cells[idx.email],
      initial_password: cells[idx.initial_password],
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') { inQuote = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const files = (await readdir(CSV_DIR))
    .filter((f) => f.startsWith("initial-credentials-") && f.endsWith(".csv"))
    .sort(); // 시간순 (오래된 것부터)

  if (files.length === 0) {
    console.log(`[backfill] ${CSV_DIR} 에 CSV 파일 없음 — 백필할 데이터 없음`);
    await pool.end();
    return;
  }

  console.log(`[backfill] ${files.length}개 CSV 파일 발견`);
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const fullPath = path.join(CSV_DIR, file);
    const text = await readFile(fullPath, "utf-8");
    const rows = parseCsv(text);
    console.log(`\n  ── ${file} : ${rows.length} 행`);

    for (const r of rows) {
      // 이미 채워진 학생은 건드리지 않음 — 안전 우선.
      const res = await pool.query(
        `UPDATE students
            SET initial_password = $3
          WHERE school_id = $1
            AND username   = $2
            AND initial_password IS NULL`,
        [r.school_id, r.username, r.initial_password],
      );
      if (res.rowCount === 1) {
        totalUpdated++;
      } else {
        totalSkipped++;
      }
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log(`✅ 업데이트: ${totalUpdated} 학생`);
  console.log(`⏭  스킵 (이미 채워졌거나 일치하는 학생 행 없음): ${totalSkipped} 행`);

  const { rows: stat } = await pool.query<{ with_pw: string; total: string }>(
    `SELECT count(*) FILTER (WHERE initial_password IS NOT NULL)::text AS with_pw,
            count(*)::text AS total FROM students`,
  );
  console.log(`📊 현재 상태: ${stat[0].with_pw} / ${stat[0].total} 학생이 initial_password 보유`);

  await pool.end();
}

main().catch((err) => {
  console.error("[backfill] 실패:", err);
  process.exit(1);
});
