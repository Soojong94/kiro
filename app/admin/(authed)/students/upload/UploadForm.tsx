"use client";

import { useActionState } from "react";
import { bulkCreateStudentsAction, type BulkResult } from "./actions";

export function UploadForm({ scopeNote }: { scopeNote: string }) {
  const [state, formAction, isPending] = useActionState<
    BulkResult | null,
    FormData
  >(bulkCreateStudentsAction, null);

  return (
    <div>
      <form
        action={formAction}
        className="rounded-lg bg-white p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]"
      >
        <div className="text-[12px] text-[#5f6b7a] mb-3">{scopeNote}</div>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[#414d5c] mb-1.5">
            CSV 파일
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            disabled={isPending}
            className="block w-full text-[13px] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-[#232f3e] file:text-white file:font-semibold file:cursor-pointer file:hover:bg-[#161e2d] cursor-pointer"
          />
        </label>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11.5px] text-[#5f6b7a]">
            UTF-8 인코딩 · 최대 500행 · 2MB 이하
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-[#0972d3] text-white text-[13px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer disabled:bg-[#95a5b8] disabled:cursor-not-allowed"
          >
            {isPending ? "업로드 중…" : "업로드"}
          </button>
        </div>
      </form>

      {state && (
        <div className="mt-5">
          {state.fatal ? (
            <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[13px] text-[#7c2c2c]">
              {state.fatal}
            </div>
          ) : (
            <>
              <div className="rounded-md bg-[#f1f8f5] ring-1 ring-[#9bd4b7] px-3 py-2.5 text-[13px] text-[#1d6638]">
                <strong className="font-bold">성공 {state.ok}건</strong>
                {state.failed > 0 && (
                  <>
                    {" · "}
                    <strong className="text-[#7c2c2c]">실패 {state.failed}건</strong>
                  </>
                )}
              </div>

              {state.errors.length > 0 && (
                <div className="mt-3 rounded-md bg-white ring-1 ring-[#eaeded] overflow-hidden">
                  <div className="px-4 py-2 border-b border-[#eaeded] text-[12px] font-semibold text-[#5f6b7a]">
                    실패 상세
                  </div>
                  <ul className="divide-y divide-[#f4f5f6]">
                    {state.errors.map((e, i) => (
                      <li
                        key={i}
                        className="px-4 py-2 flex items-center gap-3 text-[12.5px]"
                      >
                        <span className="font-mono text-[11.5px] text-[#95a5b8] shrink-0 w-12">
                          {e.row}행
                        </span>
                        <span className="text-[#16191f] flex-1">
                          {e.reason}
                          {e.preview && (
                            <span className="ml-2 text-[#95a5b8]">({e.preview})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
