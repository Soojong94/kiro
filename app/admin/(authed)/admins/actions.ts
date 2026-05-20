"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPassword, recordAudit, requireAdmin, type AdminRole } from "@/lib/auth";
import { pool } from "@/lib/db";

function ensureSuper(role: AdminRole): void {
  if (role !== "super") {
    throw new Error("forbidden: super admin only");
  }
}

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(u);
}

function isValidEmail(e: string): boolean {
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function createAdminAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const username = String(formData.get("username") ?? "").trim();
  const role = String(formData.get("role") ?? "") as AdminRole;
  const schoolId = String(formData.get("school_id") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const initialPassword = String(formData.get("initial_password") ?? "");

  if (!username || !initialPassword) {
    redirect("/admin/admins?error=required");
  }
  if (!isValidUsername(username)) {
    redirect("/admin/admins?error=username_format");
  }
  if (role !== "super" && role !== "school") {
    redirect("/admin/admins?error=role_invalid");
  }
  if (role === "school" && !schoolId) {
    redirect("/admin/admins?error=school_required");
  }
  if (email && !isValidEmail(email)) {
    redirect("/admin/admins?error=email_format");
  }
  if (initialPassword.length < 8) {
    redirect("/admin/admins?error=password_short");
  }

  const hash = await hashPassword(initialPassword);
  try {
    await pool.query(
      `INSERT INTO admins (username, password_hash, role, school_id, email)
       VALUES ($1, $2, $3, $4, $5)`,
      [username, hash, role, role === "school" ? schoolId : null, email],
    );
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "23505") {
      redirect("/admin/admins?error=username_taken");
    }
    if (e.code === "23503") {
      redirect("/admin/admins?error=school_not_found");
    }
    throw err;
  }

  await recordAudit(me.username, "admin.create", username, { role, schoolId });
  revalidatePath("/admin/admins");
  redirect("/admin/admins?ok=created");
}

export async function resetAdminPasswordAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const adminId = Number(formData.get("admin_id"));
  const newPassword = String(formData.get("new_password") ?? "");
  if (!adminId || newPassword.length < 8) {
    redirect("/admin/admins?error=reset_invalid");
  }

  const hash = await hashPassword(newPassword);
  const { rowCount } = await pool.query(
    `UPDATE admins SET password_hash = $1, password_changed_at = now() WHERE id = $2`,
    [hash, adminId],
  );
  if (!rowCount) redirect("/admin/admins?error=not_found");

  await recordAudit(me.username, "admin.password_reset", String(adminId), null);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?ok=reset");
}

export async function deleteAdminAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const adminId = Number(formData.get("admin_id"));
  if (!adminId) redirect("/admin/admins?error=invalid");

  // 자기 자신 삭제 금지
  if (adminId === me.adminId) {
    redirect("/admin/admins?error=self_delete");
  }

  // 마지막 super 어드민 보호 — super 한 명만 남으면 그 super 삭제 금지
  const { rows: targetRows } = await pool.query<{ role: AdminRole }>(
    `SELECT role FROM admins WHERE id = $1`,
    [adminId],
  );
  const target = targetRows[0];
  if (!target) redirect("/admin/admins?error=not_found");
  if (target.role === "super") {
    const { rows: cntRows } = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM admins WHERE role = 'super'`,
    );
    if (Number(cntRows[0].c) <= 1) {
      redirect("/admin/admins?error=last_super");
    }
  }

  await pool.query(`DELETE FROM admins WHERE id = $1`, [adminId]);
  await recordAudit(me.username, "admin.delete", String(adminId), null);
  revalidatePath("/admin/admins");
  redirect("/admin/admins?ok=deleted");
}
