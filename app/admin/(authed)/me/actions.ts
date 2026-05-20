"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

// "유지하기" 클릭 → 30일간 모달 안 뜨도록 password_reminded_at = now() 기록.
// 비번 자체는 안 바뀜. 다음 알림은 30일 뒤 또는 다음 로그인 (어느 쪽이든 먼저).
export async function acknowledgePasswordReminderAction(): Promise<void> {
  const me = await requireAdmin();
  await pool.query(
    `UPDATE admins SET password_reminded_at = now() WHERE id = $1`,
    [me.adminId],
  );
  revalidatePath("/admin");
}
