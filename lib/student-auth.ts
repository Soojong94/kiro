// 학생 로그인 — 어드민이 발급한 username/password.
// 어드민과는 다른 쿠키 (동시 로그인 가능).
// IP rate limit / Argon2id 헬퍼는 lib/auth.ts 와 공유.

import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "./auth";
import { pool } from "./db";

export interface StudentSession {
  schoolId?: string;
  userId?: string;
  username?: string;
  mustChangePassword?: boolean;
  loggedInAt?: number;
}

const cookiePassword = process.env.SESSION_COOKIE_PASSWORD ?? "";

// HTTPS 없는 환경 (운영 배포 초기) 에선 SESSION_COOKIE_INSECURE=1 로 secure 끄기.
const cookieSecure =
  process.env.NODE_ENV === "production" &&
  process.env.SESSION_COOKIE_INSECURE !== "1";

const sessionOptions: SessionOptions = {
  password: cookiePassword,
  cookieName: "kiro_student",
  cookieOptions: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7일 (학생은 자주 보니까 길게)
    path: "/",
  },
};

// 기본 세션 로더 — 어떤 환경에서도 안전 (cookies 수정 X).
// 로그인 / 로그인 페이지 등 "active 여부 무관한 흐름" 에서 사용.
export async function getStudentSession() {
  if (!cookiePassword || cookiePassword.length < 32) {
    throw new Error(
      "SESSION_COOKIE_PASSWORD 가 32자 이상이어야 합니다 (.env.local 확인)",
    );
  }
  const store = await cookies();
  return getIronSession<StudentSession>(store, sessionOptions);
}

// 학생 페이지 진입 시 사용 — deactivated 학생은 /login?deactivated=1 로 즉시 redirect.
// server component / server action 양쪽에서 안전 (cookies 수정 안 함, redirect 만 throw).
// 다른 디바이스에 살아있던 세션도 다음 요청에서 이 함수가 막아줌.
//
// 주의: /login 페이지에서는 이 함수 호출 금지 — 무한 redirect 됨. /login 은 getStudentSession 사용.
export async function requireActiveStudent() {
  const session = await getStudentSession();
  if (!session.userId || !session.schoolId) return session;

  const { rows } = await pool.query<{ deactivated: boolean }>(
    `SELECT (deactivated_at IS NOT NULL) AS deactivated
       FROM students
      WHERE school_id = $1 AND user_id = $2`,
    [session.schoolId, session.userId],
  );
  if (rows[0]?.deactivated) {
    redirect("/login?deactivated=1");
  }
  return session;
}

export interface StudentLoginRow {
  schoolId: string;
  userId: string;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
}

export async function findStudentByUsername(
  username: string,
): Promise<StudentLoginRow | null> {
  // deactivated_at 가드 — 본인이 탈퇴한 계정은 로그인 자체 차단.
  // 어드민이 UPDATE deactivated_at=NULL 로 복구해줘야만 다시 로그인 가능.
  const { rows } = await pool.query<{
    school_id: string;
    user_id: string;
    username: string;
    password_hash: string;
    must_change_password: boolean;
  }>(
    `SELECT school_id, user_id, username, password_hash, must_change_password
       FROM students
      WHERE username = $1
        AND password_hash IS NOT NULL
        AND deactivated_at IS NULL
      LIMIT 1`,
    [username],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    schoolId: r.school_id,
    userId: r.user_id,
    username: r.username,
    passwordHash: r.password_hash,
    mustChangePassword: r.must_change_password,
  };
}

export async function touchStudentLastLogin(
  schoolId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE students SET last_login_at = now() WHERE school_id = $1 AND user_id = $2`,
    [schoolId, userId],
  );
}

// 비번 변경 — 새 해시 저장 + must_change_password 해제
export async function updateStudentPassword(
  schoolId: string,
  userId: string,
  newPlain: string,
): Promise<void> {
  const hash = await hashPassword(newPlain);
  await pool.query(
    `UPDATE students
        SET password_hash = $1, must_change_password = false
      WHERE school_id = $2 AND user_id = $3`,
    [hash, schoolId, userId],
  );
}

// 현재 비번 일치 여부 (변경 시 본인 확인용)
export async function verifyCurrentStudentPassword(
  schoolId: string,
  userId: string,
  plain: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM students WHERE school_id = $1 AND user_id = $2`,
    [schoolId, userId],
  );
  const stored = rows[0]?.password_hash;
  if (!stored) return false;
  return verifyPassword(plain, stored);
}

// 학생 본인 탈퇴 — 비번 재확인 후 deactivated_at = now() 마킹.
// 데이터는 그대로 보존 (daily_usage / model_usage / real_name). 로그인만 차단.
// 어드민이 UPDATE deactivated_at = NULL 로 복구 가능.
//
// 동시에 본인의 미사용 reset 토큰도 모두 무효화 — 탈퇴 직전에 발급된 토큰으로
// 1시간 안에 비번 변경하는 우회 막음 (변경해도 로그인은 차단이지만 깔끔하게).
export async function deactivateStudent(
  schoolId: string,
  userId: string,
  currentPassword: string,
): Promise<boolean> {
  const ok = await verifyCurrentStudentPassword(schoolId, userId, currentPassword);
  if (!ok) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE students SET deactivated_at = now()
        WHERE school_id = $1 AND user_id = $2 AND deactivated_at IS NULL`,
      [schoolId, userId],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE student_school_id = $1 AND student_user_id = $2 AND used_at IS NULL`,
      [schoolId, userId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return true;
}
