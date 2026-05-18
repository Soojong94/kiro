"use server";

import { redirect } from "next/navigation";
import {
  getStudentSession,
  updateStudentPassword,
  verifyCurrentStudentPassword,
} from "@/lib/student-auth";

export async function changePasswordAction(formData: FormData): Promise<void> {
  const session = await getStudentSession();
  if (!session.userId || !session.schoolId) {
    redirect("/login");
  }
  // 위 redirect 이후 TS narrowing 안 됨 — 명시적으로 변수에 캡쳐
  const schoolId = session.schoolId!;
  const userId = session.userId!;

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current || !next || !confirm) {
    redirect("/change-password?error=empty");
  }
  if (next.length < 8) {
    redirect("/change-password?error=short");
  }
  if (next !== confirm) {
    redirect("/change-password?error=mismatch");
  }
  if (next === current) {
    redirect("/change-password?error=same");
  }

  const ok = await verifyCurrentStudentPassword(schoolId, userId, current);
  if (!ok) {
    redirect("/change-password?error=wrong");
  }

  await updateStudentPassword(schoolId, userId, next);

  // 세션에서 must_change 해제
  session.mustChangePassword = false;
  await session.save();

  redirect("/?changed=1");
}
