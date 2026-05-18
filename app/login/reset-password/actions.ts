"use server";

import { redirect } from "next/navigation";
import { consumeResetToken } from "@/lib/student-recovery";

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) {
    redirect("/login/reset-password?error=missing_token");
  }
  if (!next || !confirm) {
    redirect(`/login/reset-password?token=${encodeURIComponent(token)}&error=empty`);
  }
  if (next.length < 8) {
    redirect(`/login/reset-password?token=${encodeURIComponent(token)}&error=short`);
  }
  if (next !== confirm) {
    redirect(`/login/reset-password?token=${encodeURIComponent(token)}&error=mismatch`);
  }

  const result = await consumeResetToken(token, next);
  if (!result.ok) {
    redirect(
      `/login/reset-password?token=${encodeURIComponent(token)}&error=${result.reason ?? "invalid"}`,
    );
  }

  redirect("/login?reset=1");
}
