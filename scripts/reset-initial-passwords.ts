// 일회성 — TBIT 사내 외 학교의 비번 미발급 학생에게 초기 비번 일괄 재발급.
//
// 배경: 마이그레이션 009 이전 sync 가 만든 CSV 가 컨테이너 재빌드 때 날아가서
//       어드민이 학생 초기 비번을 모름. 평문은 복원 불가능 (해시 단방향).
//       그래서 미발급 학생만 새 비번 발급 + initial_password 저장 + 학생에게 재전달.
//
// 대상 가드 (3중):
//   - school_id <> 'tbit'                   사내 계정 제외
//   - initial_password IS NULL              이미 발급된 학생 안 건드림
//   - must_change_password = true           본인이 비번 변경한 학생도 안 건드림
//
// 동작:
//   - 새 랜덤 비번 생성 → password_hash + initial_password 동시 UPDATE
//   - samples/credentials/initial-credentials-reset-<ts>.csv 로 어드민 백업본 출력
//
// 실행: docker exec kiro-next npm run reset-initial-passwords

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db";

const EXCLUDED_SCHOOLS = ["tbit"];

function generateInitialPassword(): string {
  // sync-identity-center 와 동일한 charset (0/O, 1/l/I 제외 10자).
  const charset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += charset.charAt(bytes[i] % charset.length);
  }
  return s;
}

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Target {
  school_id: string;
  user_id: string;
  real_name: string;
  username: string | null;
  email: string | null;
}

async function main() {
  const { rows: targets } = await pool.query<Target>(
    `SELECT school_id, user_id, real_name, username, email
       FROM students
      WHERE school_id <> ALL($1)
        AND initial_password IS NULL
        AND must_change_password = true
        AND username IS NOT NULL
      ORDER BY school_id, real_name`,
    [EXCLUDED_SCHOOLS],
  );

  // 학교별 카운트 미리보기
  const byCity = new Map<string, number>();
  for (const t of targets) byCity.set(t.school_id, (byCity.get(t.school_id) ?? 0) + 1);

  console.log(`[reset] 대상: ${targets.length}명`);
  console.log(`        제외: ${EXCLUDED_SCHOOLS.join(", ")} + initial_password 보유 + 본인 변경 완료 학생`);
  for (const [s, n] of byCity) {
    console.log(`          ${s.padEnd(20)} ${n}명`);
  }
  console.log();

  if (targets.length === 0) {
    console.log("[reset] 대상 없음 — 종료");
    await pool.end();
    return;
  }

  interface NewCred {
    schoolId: string;
    username: string;
    realName: string;
    email: string;
    initialPassword: string;
  }
  const newCreds: NewCred[] = [];

  for (const t of targets) {
    const plain = generateInitialPassword();
    const hash = await hashPassword(plain);
    // WHERE 절에 가드 다시 한 번 — race condition 방어.
    const res = await pool.query(
      `UPDATE students
          SET password_hash = $1, initial_password = $2
        WHERE school_id = $3 AND user_id = $4
          AND initial_password IS NULL
          AND must_change_password = true`,
      [hash, plain, t.school_id, t.user_id],
    );
    if (res.rowCount === 1 && t.username) {
      newCreds.push({
        schoolId: t.school_id,
        username: t.username,
        realName: t.real_name,
        email: t.email ?? "",
        initialPassword: plain,
      });
    }
  }

  // CSV 저장
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = "./samples/credentials";
  await mkdir(dir, { recursive: true });
  const out = `${dir}/initial-credentials-reset-${ts}.csv`;
  const header = "school_id,username,real_name,email,initial_password";
  const lines = newCreds.map((c) =>
    [c.schoolId, c.username, c.realName, c.email, c.initialPassword]
      .map(csvEscape)
      .join(","),
  );
  // UTF-8 BOM + CRLF (Excel 한글 호환)
  await writeFile(out, "﻿" + [header, ...lines].join("\r\n") + "\r\n", "utf-8");

  console.log(`✅ ${newCreds.length}명 재발급 완료`);
  console.log(`📋 CSV → ${out}`);
  console.log("   ⚠ 학생들에게 새 비번 전달 필요 — 기존에 어드민이 알려준 비번은 무효화됨.");

  await pool.end();
}

main().catch((err) => {
  console.error("[reset] 실패:", err);
  process.exit(1);
});
