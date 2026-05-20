"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  findAdminByUsername,
  hashPassword,
  recordAudit,
  requireAdmin,
  verifyPassword,
} from "@/lib/auth";
import { pool } from "@/lib/db";

// 본인 비번 변경 — 현재 비번 확인 + 새 비번 저장 + password_changed_at 갱신.
export async function changeMyPasswordAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const newPassword2 = String(formData.get("new_password_confirm") ?? "");

  if (!currentPassword || !newPassword) {
    redirect("/admin/me/change-password?error=required");
  }
  if (newPassword !== newPassword2) {
    redirect("/admin/me/change-password?error=mismatch");
  }
  if (newPassword.length < 8) {
    redirect("/admin/me/change-password?error=password_short");
  }
  if (newPassword === currentPassword) {
    redirect("/admin/me/change-password?error=same_as_current");
  }

  // 현재 비번 확인
  const row = await findAdminByUsername(me.username);
  if (!row) redirect("/admin/me/change-password?error=not_found");
  const ok = await verifyPassword(currentPassword, row.passwordHash);
  if (!ok) redirect("/admin/me/change-password?error=current_wrong");

  // 새 비번 저장 + 갱신 시각 기록
  const hash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE admins SET password_hash = $1, password_changed_at = now() WHERE id = $2`,
    [hash, me.adminId],
  );

  await recordAudit(me.username, "admin.self_password_change", String(me.adminId), null);
  revalidatePath("/admin");
  redirect("/admin?ok=password_changed");
}
