"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assertSchoolScope,
  hashPassword,
  recordAudit,
  requireAdmin,
} from "@/lib/auth";
import { pool } from "@/lib/db";

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(u);
}

function isValidEmail(e: string): boolean {
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// 학생 생성 + 로그인 계정 발급 (한 폼)
export async function createStudentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const schoolId = String(formData.get("school_id") ?? "").trim();
  const userIdRaw = String(formData.get("user_id") ?? "").trim();
  const realName = String(formData.get("real_name") ?? "").trim();
  const cohort = String(formData.get("cohort") ?? "").trim() || null;
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const initialPassword = String(formData.get("initial_password") ?? "");

  if (!schoolId || !realName || !username || !email || !initialPassword) {
    redirect("/admin/students?error=required");
  }
  // user_id 미입력 시 자동 생성 (Kiro 매핑 전 임시)
  const userId = userIdRaw || randomUUID();

  if (!isValidUsername(username)) {
    redirect("/admin/students?error=username_format");
  }
  if (!isValidEmail(email)) {
    redirect("/admin/students?error=email_format");
  }
  if (initialPassword.length < 8) {
    redirect("/admin/students?error=password_short");
  }

  assertSchoolScope(admin.role, admin.schoolId, schoolId);

  const passwordHash = await hashPassword(initialPassword);

  try {
    await pool.query(
      `INSERT INTO students
         (school_id, user_id, real_name, cohort,
          username, password_hash, email, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [schoolId, userId, realName, cohort, username, passwordHash, email],
    );
  } catch (err: unknown) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === "23505") {
      // unique violation
      if (e.constraint?.includes("username")) {
        redirect("/admin/students?error=username_taken");
      }
      if (e.constraint?.includes("email")) {
        redirect("/admin/students?error=email_taken");
      }
      if (e.constraint?.includes("pkey")) {
        redirect("/admin/students?error=user_id_taken");
      }
    }
    throw err;
  }

  await recordAudit(admin.username, "student.create", `${schoolId}/${userId}`, {
    username,
    email,
  });

  revalidatePath("/admin/students");
  redirect("/admin/students?ok=created");
}

// 비번 재발급 — 초기화 + must_change_password=true
export async function resetStudentPasswordAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const schoolId = String(formData.get("school_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");

  if (!schoolId || !userId || newPassword.length < 8) {
    redirect("/admin/students?error=reset_invalid");
  }

  assertSchoolScope(admin.role, admin.schoolId, schoolId);

  const passwordHash = await hashPassword(newPassword);
  const { rowCount } = await pool.query(
    `UPDATE students
        SET password_hash = $1, must_change_password = true
      WHERE school_id = $2 AND user_id = $3`,
    [passwordHash, schoolId, userId],
  );
  if (!rowCount) {
    redirect("/admin/students?error=not_found");
  }

  await recordAudit(
    admin.username,
    "student.password_reset",
    `${schoolId}/${userId}`,
    null,
  );

  revalidatePath("/admin/students");
  redirect("/admin/students?ok=reset");
}

// 학생 행 삭제 (CASCADE 로 관련 데이터 같이 정리됨)
export async function deleteStudentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  const schoolId = String(formData.get("school_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!schoolId || !userId) {
    redirect("/admin/students?error=invalid");
  }

  assertSchoolScope(admin.role, admin.schoolId, schoolId);

  const { rowCount } = await pool.query(
    `DELETE FROM students WHERE school_id = $1 AND user_id = $2`,
    [schoolId, userId],
  );
  if (!rowCount) {
    redirect("/admin/students?error=not_found");
  }

  await recordAudit(
    admin.username,
    "student.delete",
    `${schoolId}/${userId}`,
    null,
  );

  revalidatePath("/admin/students");
  redirect("/admin/students?ok=deleted");
}
