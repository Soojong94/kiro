"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-3 py-2 rounded-md bg-[#232f3e] text-white text-[12.5px] font-semibold hover:bg-[#161e2d] cursor-pointer"
    >
      인쇄 / PDF 저장
    </button>
  );
}
