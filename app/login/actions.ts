"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  isLocked,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  verifyPassword,
} from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  findStudentByUsername,
  getStudentSession,
  touchStudentLastLogin,
} from "@/lib/student-auth";
import { requestInitialSetup } from "@/lib/student-recovery";

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

// 1단계: 학생이 username 만 입력. 상태 따라 분기.
//   - must_change_password=true → 등록 이메일로 토큰 링크 발송 + /login/email-sent
//   - must_change_password=false → /login/password?username=... 로 (비번 입력)
//   - 학생 없음 / 탈퇴 / 비번 없음 → /login?error=invalid
//
// (어드민이 학생에 초기 비번을 미리 알려줄 필요 없음 — 학생이 본인 이메일로 셋업.)
export async function studentLoginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const ip = await clientIp();

  if (!username) {
    redirect("/login?error=empty");
  }

  const lockedSec = isLocked(ip);
  if (lockedSec > 0) {
    redirect(`/login?error=locked&sec=${lockedSec}`);
  }

  // 학생 조회 — findStudentByUsername 는 deactivated_at + password_hash 가드까지 포함
  const student = await findStudentByUsername(username);
  if (!student) {
    recordLoginFailure(ip);
    await recordLoginAttempt("student", "fail", {
      username,
      ip,
      reason: "user_not_found",
    });
    redirect("/login?error=invalid");
  }

  if (student.mustChangePassword) {
    // 첫 로그인 — 이메일로 토큰 링크 발송. 학생 메일 조회 + initial setup.
    const { rows } = await pool.query<{ real_name: string; email: string | null }>(
      `SELECT real_name, email FROM students WHERE school_id = $1 AND user_id = $2`,
      [student.schoolId, student.userId],
    );
    const row = rows[0];
    if (!row?.email) {
      // 이메일이 등록 안 된 학생 — 어드민에게 문의 (가드용 안내)
      redirect("/login?error=no_email");
    }
    await requestInitialSetup({
      schoolId: student.schoolId,
      userId: student.userId,
      realName: row!.real_name,
      email: row!.email!,
    });
    await recordLoginAttempt("student", "success", {
      username: student.username,
      ip,
      reason: "initial_setup_mail",
    });
    redirect(`/login/email-sent?email=${encodeURIComponent(maskEmail(row!.email!))}`);
  }

  // 이미 비번 설정한 학생 — 2단계로 (username 갖고 비번 입력 페이지)
  redirect(`/login/password?username=${encodeURIComponent(username)}`);
}

// 이메일 부분 마스킹 — 안내 페이지에 노출 (개인정보 보호)
// "abc@example.com" → "a**@example.com"
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return email;
  const head = email.slice(0, 1);
  const tail = email.slice(at);
  return head + "*".repeat(Math.max(2, at - 1)) + tail;
}

// 2단계: username + password 받음. 인증 + session.
export async function studentPasswordLoginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  if (!username || !password) {
    redirect(`/login/password?username=${encodeURIComponent(username)}&error=empty`);
  }

  const lockedSec = isLocked(ip);
  if (lockedSec > 0) {
    redirect(`/login/password?username=${encodeURIComponent(username)}&error=locked&sec=${lockedSec}`);
  }

  const student = await findStudentByUsername(username);
  // 사용자 존재 노출 차단 — timing 균일화
  const dummyHash =
    "$argon2id$v=19$m=65536,t=3,p=4$ZmFrZWZha2VmYWtl$ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U";
  const ok = student
    ? await verifyPassword(password, student.passwordHash)
    : await verifyPassword(password, dummyHash);

  if (!student || !ok) {
    recordLoginFailure(ip);
    await recordLoginAttempt("student", "fail", {
      username,
      ip,
      reason: student ? "wrong_password" : "user_not_found",
    });
    redirect(`/login/password?username=${encodeURIComponent(username)}&error=invalid`);
  }

  // 비번 입력 단계까지 왔는데 mustChangePassword=true 인 경우 (race) — 안전망
  if (student.mustChangePassword) {
    redirect("/login?error=use_initial");
  }

  recordLoginSuccess(ip);
  const session = await getStudentSession();
  session.schoolId = student.schoolId;
  session.userId = student.userId;
  session.username = student.username;
  session.mustChangePassword = student.mustChangePassword;
  session.loggedInAt = Date.now();
  await session.save();

  await touchStudentLastLogin(student.schoolId, student.userId);
  await recordLoginAttempt("student", "success", {
    username: student.username,
    ip,
  });

  redirect("/");
}

export async function studentLogoutAction(): Promise<void> {
  const session = await getStudentSession();
  await session.destroy();
  redirect("/login");
}
