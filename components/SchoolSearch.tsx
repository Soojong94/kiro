"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { School } from "@/lib/types";

export function SchoolSearch({
  schools,
  value,
  otherParams,
  basePath = "/",
}: {
  schools: School[];
  value: string;
  otherParams: Record<string, string>;
  basePath?: string;
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
    const all = [{ id: "all", name: "전체 조직", kind: "all" as const }, ...schools];
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
    router.push(`${basePath}?${sp.toString()}`, { scroll: false });
    setOpen(false);
    setQuery("");
  };

  const buttonLabel = selected ? selected.name : "전체 조직";

  return (
    <div ref={wrapRef} className="relative inline-block w-full max-w-[280px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] hover:bg-[#f2f3f3] text-[13px] font-semibold text-[#16191f] transition-colors"
      >
        <span className="truncate">{buttonLabel}</span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path
            d="M5 7.5l5 5 5-5"
            stroke="#5f6b7a"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full max-w-[320px] rounded-md bg-white shadow-[0_4px_12px_rgba(0,28,36,0.1)] ring-1 ring-[#d5dbdb] overflow-hidden">
          <div className="p-2 border-b border-[#eaeded]">
            <input
              type="text"
              autoFocus
              placeholder="조직명 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[13px] text-[#16191f] placeholder:text-[#5f6b7a] outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {items.length === 0 && (
              <li className="px-3 py-3 text-[13px] text-[#5f6b7a] text-center">
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
                        ? "bg-[#f2f8fd] text-[#033160] font-bold"
                        : "text-[#16191f] hover:bg-[#f2f3f3]")
                    }
                  >
                    <span className="truncate">{s.name}</span>
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
                        <path
                          d="M4 10.5l4 4 8-8"
                          stroke="#0972d3"
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
