"use server";

import { redirect } from "next/navigation";
import {
  requestPasswordReset,
  requestUsernameRecovery,
} from "@/lib/student-recovery";

// 아이디 찾기 — 이메일 입력 → 등록된 계정 있으면 아이디 메일 발송.
// 응답: 항상 "발송됨" 메시지 (이메일 존재 여부 노출 X)
export async function recoverUsernameAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/login/recover?type=username&error=empty");
  }
  try {
    await requestUsernameRecovery(email);
  } catch (err) {
    console.error("[recoverUsername] 발송 실패:", err);
    redirect("/login/recover?type=username&error=send_failed");
  }
  redirect("/login/recover?type=username&sent=1");
}

// 비밀번호 재설정 요청 — 이메일 입력 → 토큰 + 링크 메일 발송.
export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect("/login/recover?type=password&error=empty");
  }
  try {
    await requestPasswordReset(email);
  } catch (err) {
    console.error("[requestPasswordReset] 발송 실패:", err);
    redirect("/login/recover?type=password&error=send_failed");
  }
  redirect("/login/recover?type=password&sent=1");
}
