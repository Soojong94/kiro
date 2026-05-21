// 학생 로그인 — 어드민이 발급한 username/password.
// 어드민과는 다른 쿠키 (동시 로그인 가능).
// IP rate limit / Argon2id 헬퍼는 lib/auth.ts 와 공유.

import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
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

export async function getStudentSession() {
  if (!cookiePassword || cookiePassword.length < 32) {
    throw new Error(
      "SESSION_COOKIE_PASSWORD 가 32자 이상이어야 합니다 (.env.local 확인)",
    );
  }
  const store = await cookies();
  return getIronSession<StudentSession>(store, sessionOptions);
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
// 데이터는 그대로 보존 (daily_usage / model_usage). 로그인 / 랭킹 노출만 차단.
// 어드민이 UPDATE deactivated_at = NULL 로 복구 가능.
export async function deactivateStudent(
  schoolId: string,
  userId: string,
  currentPassword: string,
): Promise<boolean> {
  const ok = await verifyCurrentStudentPassword(schoolId, userId, currentPassword);
  if (!ok) return false;
  await pool.query(
    `UPDATE students SET deactivated_at = now()
      WHERE school_id = $1 AND user_id = $2 AND deactivated_at IS NULL`,
    [schoolId, userId],
  );
  return true;
}
