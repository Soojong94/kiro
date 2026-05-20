"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acknowledgePasswordReminderAction } from "@/app/admin/(authed)/me/actions";

// 비번이 90일 이상 사용된 어드민에게 표시되는 모달.
// 표시 여부 자체는 서버 (layout) 가 결정 — 마운트되면 무조건 띄움.
// "유지하기" 클릭 → 서버 액션으로 password_reminded_at = now() 기록 → 30일간 안 뜸.
// "지금 변경" → /admin/me/change-password 로 이동.
export function PasswordExpiryModal({
  ageDays,
  thresholdDays = 90,
}: {
  ageDays: number;
  thresholdDays?: number;
}) {
  const [open, setOpen] = useState(true);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const onSnooze = () => {
    startTransition(async () => {
      try {
        await acknowledgePasswordReminderAction();
      } catch {
        // 실패해도 UI 는 닫음 — 30일 안 흘렀으면 다음 페이지 진입 시 또 뜸
      }
      setOpen(false);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(22,25,31,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-expiry-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="text-[28px] leading-none">🔐</div>
          <div>
            <h2 id="pw-expiry-title" className="text-[16px] font-bold text-[#16191f]">
              비밀번호 갱신 권장
            </h2>
            <p className="mt-1 text-[12.5px] text-[#414d5c]">
              현재 비밀번호를 <strong>{ageDays}일</strong> 사용 중 (권장 갱신 주기 {thresholdDays}일).
            </p>
          </div>
        </div>
        <p className="text-[12.5px] text-[#5f6b7a] mb-5 leading-relaxed">
          오랜 비밀번호는 노출 시 피해가 큽니다. 지금 바꾸거나, <strong>30일 동안</strong> 알림을 미룰 수 있습니다.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSnooze}
            disabled={pending}
            className="px-3.5 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer disabled:opacity-50"
          >
            {pending ? "처리 중…" : "30일 미루기"}
          </button>
          <Link
            href="/admin/me/change-password"
            className="px-3.5 py-2 rounded-md bg-[#0972d3] text-white text-[12.5px] font-semibold hover:bg-[#033160] cursor-pointer"
          >
            지금 변경
          </Link>
        </div>
      </div>
    </div>
  );
}
