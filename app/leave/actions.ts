"use server";

import { redirect } from "next/navigation";
import { deactivateStudent, getStudentSession } from "@/lib/student-auth";

// 학생 본인 탈퇴 — 현재 비번 재확인 + "탈퇴합니다" 체크 후 deactivated_at 마킹.
// 성공 시 세션 파기 + /login 으로 이동. 실패 시 /leave?error=<code> 로 복귀.
export async function leaveAction(formData: FormData): Promise<void> {
  const session = await getStudentSession();
  if (!session.userId || !session.schoolId) {
    redirect("/login");
  }

  const password = String(formData.get("password") ?? "");
  const confirmed = formData.get("confirm") === "on";

  if (!password) {
    redirect("/leave?error=empty");
  }
  if (!confirmed) {
    redirect("/leave?error=unconfirmed");
  }

  const ok = await deactivateStudent(
    session.schoolId!,
    session.userId!,
    password,
  );
  if (!ok) {
    redirect("/leave?error=wrong");
  }

  // 세션 파기 — destroy 는 async 라 반드시 await (안 하면 쿠키 제거가 redirect 보다 늦음).
  await session.destroy();
  redirect("/login?left=1");
}
