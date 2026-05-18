// 테스트용 학생 계정 시드. 본인 순위 하이라이트 검증용 — mock 데이터(lib/mock.ts)의
// 해당 학교 첫 번째 학생과 동일한 user_id 로 매핑.
//
// 실행:
//   npm run seed-test-student                                       # snu / username=student
//   npm run seed-test-student -- --school dongbuk --username dong   # 동북권, username 지정
//   npm run seed-test-student -- --email you@gmail.com              # 이메일 지정 (복구 메일 테스트)
//
// 멱등 — 반복 실행 시 username/비번/이메일 갱신. username 중복 시 INSERT 실패.

import { hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db";

// lib/mock.ts SCHOOLS 순서와 동일해야 user_id 가 mock 과 일치함.
// 학교당 20명씩 묶여 1번부터 부여.
const MOCK_SCHOOLS = [
  { id: "snu",     name: "서울대학교",         kind: "university",  firstName: "김민준" },
  { id: "kaist",   name: "KAIST",              kind: "university",  firstName: "조하은" },
  { id: "postech", name: "포항공과대학교",     kind: "university",  firstName: "오서윤" },
  { id: "minjok",  name: "민족사관고등학교",   kind: "high_school", firstName: "황도현" },
  { id: "daewon",  name: "대원외국어고등학교", kind: "high_school", firstName: "홍시아" },
  { id: "dongbuk", name: "동북권",             kind: "region",      firstName: "김도훈" },
] as const;

const TEST_PASSWORD = "test1234";

function makeUserId(idx: number): string {
  return `00000000-0000-4000-8000-${String(idx).padStart(12, "0")}`;
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const schoolId = getArg("school") ?? "snu";
  const overrideEmail = getArg("email");
  const overrideUsername = getArg("username");

  const schoolIdx = MOCK_SCHOOLS.findIndex((s) => s.id === schoolId);
  if (schoolIdx < 0) {
    console.error(
      `[seed-test-student] 알 수 없는 school id '${schoolId}'. 선택지: ${MOCK_SCHOOLS.map((s) => s.id).join(", ")}`,
    );
    process.exit(1);
  }
  const school = MOCK_SCHOOLS[schoolIdx];

  // 모든 학교 행 보장 (반복 실행 안전)
  for (const s of MOCK_SCHOOLS) {
    await pool.query(
      `INSERT INTO schools (id, name, kind) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [s.id, s.name, s.kind],
    );
  }

  // mock 의 해당 학교 첫 학생 userId
  const userId = makeUserId(schoolIdx * 20 + 1);
  // 기본 username: snu 면 'student', 그 외엔 schoolId. 명시적 override 가능.
  const username = overrideUsername ?? (schoolId === "snu" ? "student" : schoolId);
  const email = overrideEmail ?? `${schoolId}.test@example.com`;
  const cohort =
    school.kind === "university" ? "2026 학부생"
      : school.kind === "high_school" ? "2026-1학년"
        : "2026 참여자";

  const hash = await hashPassword(TEST_PASSWORD);

  await pool.query(
    `INSERT INTO students
       (school_id, user_id, real_name, cohort,
        username, password_hash, email, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     ON CONFLICT (school_id, user_id) DO UPDATE SET
       username = EXCLUDED.username,
       password_hash = EXCLUDED.password_hash,
       email = EXCLUDED.email,
       must_change_password = false`,
    [schoolId, userId, school.firstName, cohort, username, hash, email],
  );

  console.log("──────────────────────────────────────");
  console.log("테스트 학생 계정 시드 완료");
  console.log("──────────────────────────────────────");
  console.log(`  학교       : ${school.name} (${schoolId})`);
  console.log(`  실명       : ${school.firstName}`);
  console.log(`  username   : ${username}`);
  console.log(`  password   : ${TEST_PASSWORD}`);
  console.log("");
  console.log("→ http://localhost:3000/login 에서 위 정보로 로그인");
  console.log("──────────────────────────────────────");

  await pool.end();
}

main().catch((err) => {
  console.error("[seed-test-student] 실패:", err);
  process.exit(1);
});
