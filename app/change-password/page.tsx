import { redirect } from "next/navigation";
import { requireActiveStudent } from "@/lib/student-auth";
import { changePasswordAction } from "./actions";

export const metadata = {
  title: "비밀번호 변경 · Kiro 통합 랭킹",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "empty") return "모든 항목을 입력해주세요.";
  if (code === "short") return "새 비밀번호는 8자 이상이어야 합니다.";
  if (code === "mismatch") return "새 비밀번호 확인이 일치하지 않습니다.";
  if (code === "same") return "기존 비밀번호와 동일합니다.";
  if (code === "wrong") return "현재 비밀번호가 올바르지 않습니다.";
  return "비밀번호 변경에 실패했습니다.";
}

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireActiveStudent();
  if (!session.userId) {
    redirect("/login");
  }

  const sp = await searchParams;
  const code = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const msg = errorMessage(code);
  const forced = session.mustChangePassword;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "#fafafa" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
            비밀번호 변경
          </h1>
          {forced && (
            <p className="text-[12.5px] text-[#7c2c2c] mt-1.5">
              첫 로그인입니다. 비밀번호를 새로 설정해주세요.
            </p>
          )}
        </div>

        <form
          action={changePasswordAction}
          className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] p-6 space-y-4"
        >
          <Field
            id="current"
            label={forced ? "초기 비밀번호" : "현재 비밀번호"}
            autoComplete="current-password"
            autoFocus
          />
          <Field
            id="next"
            label="새 비밀번호 (8자 이상)"
            autoComplete="new-password"
          />
          <Field
            id="confirm"
            label="새 비밀번호 확인"
            autoComplete="new-password"
          />

          {msg && (
            <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
              {msg}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-2.5 rounded-md bg-[#0972d3] text-white text-[14px] font-semibold hover:bg-[#033160] transition-colors"
          >
            변경하기
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[12px] font-semibold text-[#414d5c] mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="password"
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[14px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
      />
    </div>
  );
}
