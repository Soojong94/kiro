"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { School } from "@/lib/types";

export function SchoolSearch({
  schools,
  value,
  otherParams,
}: {
  schools: School[];
  value: string;
  otherParams: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    if (value === "all" || !value) return null;
    return schools.find((s) => s.id === value) ?? null;
  }, [schools, value]);

  const items = useMemo(() => {
    const all = [{ id: "all", name: "전체 학교", kind: "all" as const }, ...schools];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q));
  }, [schools, query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const select = (id: string) => {
    const sp = new URLSearchParams(otherParams);
    sp.set("school", id);
    router.push(`/?${sp.toString()}`, { scroll: false });
    setOpen(false);
    setQuery("");
  };

  const buttonLabel = selected ? selected.name : "전체 학교";

  return (
    <div ref={wrapRef} className="relative inline-block w-full max-w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[#f4f5f7] hover:bg-[#eaecef] text-[13px] font-semibold text-[#191f28] transition-colors"
      >
        <span className="truncate">{buttonLabel}</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M5 7.5l5 5 5-5"
            stroke="#8b95a1"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-w-[320px] rounded-2xl bg-white shadow-[0_6px_24px_rgba(0,0,0,0.08)] ring-1 ring-[#eaecef] overflow-hidden">
          <div className="p-2 border-b border-[#f1f3f5]">
            <input
              type="text"
              autoFocus
              placeholder="학교명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#f4f5f7] text-[13px] text-[#191f28] placeholder:text-[#8b95a1] outline-none focus:ring-2 focus:ring-[#3182f6]/30"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {items.length === 0 && (
              <li className="px-3 py-3 text-[13px] text-[#8b95a1] text-center">
                검색 결과가 없습니다
              </li>
            )}
            {items.map((s) => {
              const active = s.id === value;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => select(s.id)}
                    className={
                      "w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-2 transition-colors " +
                      (active
                        ? "bg-[#e8f3ff] text-[#1b64da] font-bold"
                        : "text-[#191f28] hover:bg-[#f4f5f7]")
                    }
                  >
                    <span className="truncate">{s.name}</span>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                          d="M4 10.5l4 4 8-8"
                          stroke="#3182f6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
