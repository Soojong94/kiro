// 어드민 인증 — Argon2id 해시 + iron-session 쿠키.
// 공개 페이지(/, /champions)는 절대 import 하지 말 것.

import { hash, verify } from "@node-rs/argon2";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { pool } from "./db";

export type AdminRole = "super" | "school";

export interface AdminSession {
  adminId?: number;
  username?: string;
  role?: AdminRole;
  schoolId?: string | null; // role='school' 이면 학교 id, super 면 null
  loggedInAt?: number;
}

const cookiePassword = process.env.SESSION_COOKIE_PASSWORD ?? "";

// HTTPS 없는 환경 (운영 배포 초기) 에선 SESSION_COOKIE_INSECURE=1 로 secure 끄기.
const cookieSecure =
  process.env.NODE_ENV === "production" &&
  process.env.SESSION_COOKIE_INSECURE !== "1";

export const sessionOptions: SessionOptions = {
  password: cookiePassword,
  cookieName: "kiro_admin",
  cookieOptions: {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8h
    path: "/",
  },
};

export async function getSession() {
  if (!cookiePassword || cookiePassword.length < 32) {
    throw new Error(
      "SESSION_COOKIE_PASSWORD 가 32자 이상이어야 합니다 (.env.local 확인)",
    );
  }
  // Next 15+ : cookies() 는 async
  const store = await cookies();
  return getIronSession<AdminSession>(store, sessionOptions);
}

// OWASP 권고치 기반. m=64MB, t=3, p=4.
// algorithm 기본값이 Argon2id (@node-rs/argon2)
const ARGON_OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON_OPTS);
}

export async function verifyPassword(
  plain: string,
  storedHash: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

export interface AdminRow {
  id: number;
  username: string;
  passwordHash: string;
  role: AdminRole;
  schoolId: string | null;
}

export async function findAdminByUsername(
  username: string,
): Promise<AdminRow | null> {
  const { rows } = await pool.query<{
    id: number;
    username: string;
    password_hash: string;
    role: AdminRole;
    school_id: string | null;
  }>(
    `SELECT id, username, password_hash, role, school_id
       FROM admins WHERE username = $1 LIMIT 1`,
    [username],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    role: r.role,
    schoolId: r.school_id,
  };
}

// /admin 페이지 진입 시 호출 — 세션 없으면 로그인으로, 있으면 정보 반환.
// 학교 어드민이면 schoolId 가 있어서 데이터 필터링에 사용.
export async function requireAdmin(): Promise<{
  adminId: number;
  username: string;
  role: AdminRole;
  schoolId: string | null;
}> {
  const s = await getSession();
  if (!s.adminId || !s.username || !s.role) {
    // 부르는 쪽에서 redirect 처리. 여기서 throw 하면 layout 이 보호 못 잡음.
    throw new Error("unauthenticated");
  }
  return {
    adminId: s.adminId,
    username: s.username,
    role: s.role,
    schoolId: s.schoolId ?? null,
  };
}

// 학교 어드민이 본인 학교 외 자원에 접근하려 할 때 throw.
export function assertSchoolScope(
  role: AdminRole,
  myScopedSchoolId: string | null,
  targetSchoolId: string,
): void {
  if (role === "super") return;
  if (myScopedSchoolId !== targetSchoolId) {
    throw new Error(
      `forbidden: school admin can only access school '${myScopedSchoolId}', not '${targetSchoolId}'`,
    );
  }
}

export async function touchLastLogin(adminId: number): Promise<void> {
  await pool.query(`UPDATE admins SET last_login_at = now() WHERE id = $1`, [
    adminId,
  ]);
}

export async function recordAudit(
  actor: string,
  action: string,
  target: string | null,
  payload: unknown,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor, action, target, payload) VALUES ($1, $2, $3, $4)`,
    [actor, action, target, JSON.stringify(payload ?? null)],
  );
}

// 로그인 실패 IP rate limit — 5회 실패 시 60초 잠금.
// 메모리 기반(단일 서버 가정). 서버 재시작 시 리셋되는 건 허용.
interface FailEntry {
  count: number;
  lockedUntil: number; // epoch ms
}
const failByIp = new Map<string, FailEntry>();

export function isLocked(ip: string, now = Date.now()): number {
  const e = failByIp.get(ip);
  if (!e) return 0;
  if (e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
  return 0;
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  const e = failByIp.get(ip) ?? { count: 0, lockedUntil: 0 };
  e.count += 1;
  if (e.count >= 5) {
    e.lockedUntil = now + 60_000;
    e.count = 0;
  }
  failByIp.set(ip, e);
}

export function recordLoginSuccess(ip: string): void {
  failByIp.delete(ip);
}
