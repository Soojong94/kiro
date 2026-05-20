"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "kiro:admin-password-reminder-dismissed";

// 비번이 90일 이상 사용된 어드민에게 1회 모달 — 갱신 또는 유지 선택.
// "유지" 선택 시 sessionStorage 에 기록해서 현재 탭/세션 내에선 다시 안 뜸.
// 새 세션(브라우저 재시작 / 다른 탭) 에선 다시 뜸.
export function PasswordExpiryModal({
  ageDays,
  thresholdDays = 90,
}: {
  ageDays: number;
  thresholdDays?: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (ageDays < thresholdDays) return;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // sessionStorage 접근 불가 (Private mode 등) — 그냥 표시
    }
    setOpen(true);
  }, [ageDays, thresholdDays]);

  if (!open) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
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
            <h2
              id="pw-expiry-title"
              className="text-[16px] font-bold text-[#16191f]"
            >
              비밀번호 갱신 권장
            </h2>
            <p className="mt-1 text-[12.5px] text-[#414d5c]">
              현재 비밀번호를 <strong>{ageDays}일</strong> 사용 중입니다 (권장 갱신 주기 {thresholdDays}일).
            </p>
          </div>
        </div>
        <p className="text-[12.5px] text-[#5f6b7a] mb-5 leading-relaxed">
          오랜 비밀번호는 노출 시 피해가 커집니다. 지금 바꾸거나, 이번 세션에서만 알림을 끌 수 있습니다 (다음 로그인 시 다시 표시).
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="px-3.5 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer"
          >
            유지하기
          </button>
          <Link
            href="/admin/me/change-password"
            className="px-3.5 py-2 rounded-md bg-[#0972d3] text-white text-[12.5px] font-semibold hover:bg-[#033160] cursor-pointer"
            onClick={dismiss}
          >
            지금 변경
          </Link>
        </div>
      </div>
    </div>
  );
}
