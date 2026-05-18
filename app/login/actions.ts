"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  isLocked,
  recordLoginFailure,
  recordLoginSuccess,
  verifyPassword,
} from "@/lib/auth";
import {
  findStudentByUsername,
  getStudentSession,
  touchStudentLastLogin,
} from "@/lib/student-auth";

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function studentLoginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  if (!username || !password) {
    redirect("/login?error=empty");
  }

  const lockedSec = isLocked(ip);
  if (lockedSec > 0) {
    redirect(`/login?error=locked&sec=${lockedSec}`);
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
    redirect("/login?error=invalid");
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

  if (student.mustChangePassword) {
    redirect("/change-password");
  }
  redirect("/");
}

export async function studentLogoutAction(): Promise<void> {
  const session = await getStudentSession();
  session.destroy();
  redirect("/login");
}
