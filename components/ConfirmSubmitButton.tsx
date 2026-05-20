"use client";

import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  message: string;
}

// 서버 액션 form 안에서 submit 버튼으로 사용 — 클릭 시 confirm 다이얼로그,
// 취소하면 submit 막음. cursor-pointer 기본 적용.
export function ConfirmSubmitButton({
  message,
  children,
  className,
  ...rest
}: Props) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={`cursor-pointer ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
