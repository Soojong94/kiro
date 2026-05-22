"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  findAdminByUsername,
  getSession,
  isLocked,
  recordAudit,
  recordLoginAttempt,
  recordLoginFailure,
  recordLoginSuccess,
  touchLastLogin,
  verifyPassword,
} from "@/lib/auth";

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function loginAction(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  if (!username || !password) {
    redirect("/admin/login?error=empty");
  }

  const lockedSec = isLocked(ip);
  if (lockedSec > 0) {
    redirect(`/admin/login?error=locked&sec=${lockedSec}`);
  }

  const admin = await findAdminByUsername(username);
  // 사용자 존재 여부를 노출하지 않기 위해 항상 verifyPassword 호출 (timing attack 완화)
  const dummyHash =
    "$argon2id$v=19$m=65536,t=3,p=4$ZmFrZWZha2VmYWtl$ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U";
  const ok = admin
    ? await verifyPassword(password, admin.passwordHash)
    : await verifyPassword(password, dummyHash);

  if (!admin || !ok) {
    recordLoginFailure(ip);
    await recordLoginAttempt("admin", "fail", {
      username,
      ip,
      reason: admin ? "wrong_password" : "user_not_found",
    });
    redirect("/admin/login?error=invalid");
  }

  recordLoginSuccess(ip);
  const session = await getSession();
  session.adminId = admin.id;
  session.username = admin.username;
  session.role = admin.role;
  session.schoolId = admin.schoolId;
  session.loggedInAt = Date.now();
  await session.save();

  await touchLastLogin(admin.id);
  await recordLoginAttempt("admin", "success", { username: admin.username, ip });

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  const username = session.username;
  await session.destroy();
  if (username) {
    await recordAudit(username, "admin.logout", null, null);
  }
  redirect("/admin/login");
}
