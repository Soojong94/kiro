import Link from "next/link";
import { PasswordField } from "@/components/PasswordField";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { changeMyPasswordAction } from "./actions";

export const metadata = {
  title: "비밀번호 변경 · Kiro 관리자",
};

const ERR_MSGS: Record<string, string> = {
  required: "현재 비밀번호와 새 비밀번호를 모두 입력하세요.",
  mismatch: "새 비밀번호와 확인 입력이 일치하지 않습니다.",
  password_short: "새 비밀번호는 8자 이상이어야 합니다.",
  same_as_current: "새 비밀번호가 현재 비밀번호와 같습니다.",
  current_wrong: "현재 비밀번호가 일치하지 않습니다.",
  not_found: "계정 정보를 찾을 수 없습니다.",
};

export default async function ChangeMyPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const errMsg = errCode ? ERR_MSGS[errCode] ?? "오류가 발생했습니다." : null;

  // 비번 나이 조회
  const { rows } = await pool.query<{ days: string }>(
    `SELECT EXTRACT(EPOCH FROM (now() - password_changed_at)) / 86400 AS days
       FROM admins WHERE id = $1`,
    [me.adminId],
  );
  const ageDays = Math.floor(Number(rows[0]?.days ?? 0));

  return (
    <main className="mx-auto max-w-md px-5 sm:px-6 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5f6b7a] hover:text-[#0972d3] cursor-pointer mb-3"
      >
        ← 대시보드로
      </Link>

      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
          비밀번호 변경
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          현재 비밀번호는 <strong>{ageDays}일</strong> 사용 중입니다.
          {ageDays >= 90 && (
            <span className="ml-1 text-[#d13212] font-semibold">
              · 90일 경과 — 갱신 권장
            </span>
          )}
        </p>
      </header>

      {errMsg && (
        <div className="mb-4 rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
          {errMsg}
        </div>
      )}

      <form
        action={changeMyPasswordAction}
        className="rounded-lg bg-white p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] space-y-4"
      >
        <Field label="현재 비밀번호" required>
          <PasswordField name="current_password" required minLength={1} />
        </Field>
        <Field label="새 비밀번호 (8자 이상)" required>
          <PasswordField name="new_password" required minLength={8} />
        </Field>
        <Field label="새 비밀번호 확인" required>
          <PasswordField name="new_password_confirm" required minLength={8} />
        </Field>
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-md bg-[#0972d3] text-white text-[13px] font-semibold hover:bg-[#033160] cursor-pointer"
          >
            변경
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold text-[#414d5c] mb-1">
        {label}
        {required && <span className="ml-1 text-[#d13212]">*</span>}
      </span>
      {children}
    </label>
  );
}
