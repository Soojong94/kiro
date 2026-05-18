// 캡처/시연용 mock 데이터 풀세트 — lib/mock.ts 의 결정론적 데이터 그대로 DB 에 적재.
// 6개 학교 + 120명 학생 (로그인 가능, 비번 'welcome1234') + 400일 daily_usage.
//
// 실행:    npm run seed-mock-full
// 초기화:  npm run reset-mock  (그 후 재실행 가능)
//
// ⚠ 실 운영 데이터 있으면 절대 실행 금지 — schools/students/daily_usage 에 충돌 시 UPDATE.

import { hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  getMockDailyUsage,
  getMockSchools,
  getMockStudents,
} from "@/lib/mock";

const TEST_PASSWORD = "welcome1234";

async function main() {
  const t0 = Date.now();
  console.log("[seed-mock-full] 시작\n");

  // 1) schools
  const schools = getMockSchools();
  for (const s of schools) {
    await pool.query(
      `INSERT INTO schools (id, name, kind) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
      [s.id, s.name, s.kind],
    );
  }
  console.log(`  ✓ schools: ${schools.length}`);

  // 2) students — 모두 같은 비번 'welcome1234'. 해시는 한 번만 (Argon2 라 2초 정도 걸림)
  const students = getMockStudents();
  console.log(`  · 비번 해시 생성 중...`);
  const hash = await hashPassword(TEST_PASSWORD);
  console.log(`  · 학생 insert 중...`);

  for (let i = 0; i < students.length; i++) {
    const st = students[i];
    const localIdx = (i % 20) + 1; // 학교 내 순번 (1~20)
    const username = `${st.schoolId}.${localIdx}`; // 예: snu.1
    const email = `${username}@school.test`;
    await pool.query(
      `INSERT INTO students
         (school_id, user_id, real_name, cohort,
          username, password_hash, email, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       ON CONFLICT (school_id, user_id) DO UPDATE SET
         real_name = EXCLUDED.real_name,
         cohort    = EXCLUDED.cohort,
         username  = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         email     = EXCLUDED.email,
         must_change_password = false`,
      [st.schoolId, st.userId, st.realName, st.cohort, username, hash, email],
    );
  }
  console.log(`  ✓ students: ${students.length}`);

  // 3) daily_usage — 400일 (월별 챔피언 12개월까지 커버)
  console.log(`  · 사용량 데이터 생성 중...`);
  const usage = getMockDailyUsage(400);

  // 배치 INSERT (멀티 값) — 500행씩 묶어서 처리
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < usage.length; i += BATCH) {
    const batch = usage.slice(i, i + BATCH);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    batch.forEach((r, j) => {
      const b = j * 9;
      placeholders.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`,
      );
      params.push(
        r.date,
        r.schoolId,
        r.userId,
        r.clientType,
        r.subscriptionTier,
        r.totalMessages,
        r.chatConversations,
        r.creditsUsed,
        r.overageCreditsUsed,
      );
    });
    await pool.query(
      `INSERT INTO daily_usage
         (date, school_id, user_id, client_type, subscription_tier,
          total_messages, chat_conversations, credits_used, overage_credits_used)
       VALUES ${placeholders.join(",")}
       ON CONFLICT DO NOTHING`,
      params,
    );
    inserted += batch.length;
  }
  console.log(`  ✓ daily_usage: ${inserted.toLocaleString()}`);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[seed-mock-full] ✅ 완료 (${dt}s)`);
  console.log("──────────────────────────────────────────────────────────");
  console.log("학생 로그인 (전원 동일 비번):");
  console.log(`  password: ${TEST_PASSWORD}`);
  console.log("  username 패턴: <school_id>.<1~20>  →  snu.1 ~ snu.20, kaist.1 ~ kaist.20, ...");
  console.log("  대표 계정 — snu.1 (김민준, 서울대 1번)");
  console.log("──────────────────────────────────────────────────────────");
  console.log("학교: snu, kaist, postech, minjok, daewon, dongbuk");

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-mock-full] 실패:", err);
  process.exit(1);
});
