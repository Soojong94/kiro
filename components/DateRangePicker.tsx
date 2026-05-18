"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 사용자 지정 기간 입력. period=custom 일 때 페이지에서 PeriodToggle 아래 노출.
// native <input type="date"> 사용 — OS 달력 UI 그대로 + 의존성 무.
export function DateRangePicker({
  from,
  to,
  maxDate,
  otherParams,
}: {
  from: string;          // YYYY-MM-DD
  to: string;
  maxDate: string;       // "어제까지" 기준의 최대 선택 가능일
  otherParams: Record<string, string>;
}) {
  const router = useRouter();
  const [fromVal, setFromVal] = useState(from);
  const [toVal, setToVal] = useState(to);

  const invalidOrder = fromVal && toVal && fromVal > toVal;

  const apply = () => {
    if (!fromVal || !toVal || invalidOrder) return;
    const sp = new URLSearchParams(otherParams);
    sp.set("period", "custom");
    sp.set("from", fromVal);
    sp.set("to", toVal);
    router.push(`/?${sp.toString()}`, { scroll: false });
  };

  const inputCls =
    "px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]";

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[13px]">
      <input
        type="date"
        value={fromVal}
        max={toVal || maxDate}
        onChange={(e) => setFromVal(e.target.value)}
        className={inputCls}
        aria-label="시작일"
      />
      <span className="text-[#5f6b7a]">~</span>
      <input
        type="date"
        value={toVal}
        min={fromVal || undefined}
        max={maxDate}
        onChange={(e) => setToVal(e.target.value)}
        className={inputCls}
        aria-label="종료일"
      />
      <button
        type="button"
        onClick={apply}
        disabled={!fromVal || !toVal || !!invalidOrder}
        className="px-3 py-1.5 rounded-md bg-[#0972d3] text-white font-semibold hover:bg-[#033160] disabled:bg-[#d5dbdb] disabled:cursor-not-allowed transition-colors"
      >
        적용
      </button>
      {invalidOrder && (
        <span className="text-[12px] text-[#d13212] ml-1">
          시작일이 종료일보다 늦습니다
        </span>
      )}
    </div>
  );
}
