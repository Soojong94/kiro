"use client";

import { useState } from "react";

type Size = "default" | "small";

export function PasswordField({
  name,
  required,
  minLength,
  placeholder,
  defaultValue,
  size = "default",
}: {
  name: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  defaultValue?: string;
  size?: Size;
}) {
  const [shown, setShown] = useState(false);

  const inputCls =
    size === "small"
      ? "w-24 px-2 py-1 pr-7 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[11px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
      : "w-full px-2.5 py-1.5 pr-8 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]";

  const btnCls =
    size === "small"
      ? "absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-[#5f6b7a] hover:text-[#16191f] cursor-pointer"
      : "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-[#5f6b7a] hover:text-[#16191f] cursor-pointer";

  return (
    <div className="relative inline-block w-full">
      <input
        name={name}
        type={shown ? "text" : "password"}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        defaultValue={defaultValue}
        autoComplete="new-password"
        className={inputCls}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "비밀번호 숨기기" : "비밀번호 표시"}
        title={shown ? "숨기기" : "표시"}
        className={btnCls}
      >
        {shown ? <EyeOffIcon size={size} /> : <EyeIcon size={size} />}
      </button>
    </div>
  );
}

function EyeIcon({ size }: { size: Size }) {
  const px = size === "small" ? 12 : 14;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ size }: { size: Size }) {
  const px = size === "small" ? 12 : 14;
  return (
    <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
