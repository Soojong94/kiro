// 최초 어드민 계정 생성 — 1회 실행.
// 비밀번호는 ADMIN_BOOTSTRAP_PASSWORD env 에서 읽음. 생성 후 즉시 env 에서 제거할 것.
//
// 실행:
//   npm run bootstrap-admin -- --username root
//   (기본 username 'admin')

import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

async function main() {
  const usernameArg = (() => {
    const i = process.argv.indexOf("--username");
    return i !== -1 ? process.argv[i + 1] : undefined;
  })();
  const username = usernameArg ?? "admin";
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!password || password.length < 8) {
    console.error(
      "[bootstrap-admin] ADMIN_BOOTSTRAP_PASSWORD 가 비었거나 너무 짧음 (8자 이상)",
    );
    process.exit(1);
  }

  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM admins WHERE username = $1`,
    [username],
  );
  if (existing.length > 0) {
    console.error(`[bootstrap-admin] '${username}' 이미 존재 — 중단`);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id`,
    [username, hash],
  );
  console.log(
    `[bootstrap-admin] 어드민 생성됨 id=${rows[0].id} username='${username}'`,
  );
  console.log(
    "[bootstrap-admin] ⚠ ADMIN_BOOTSTRAP_PASSWORD 를 .env.local 에서 즉시 제거하세요.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[bootstrap-admin] fatal:", err);
  process.exit(1);
});
