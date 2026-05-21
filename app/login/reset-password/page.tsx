import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { pool } from "@/lib/db";
import { resetPasswordAction } from "./actions";

export const metadata = {
  title: "비밀번호 재설정 · Kiro 통합 랭킹",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "missing_token") return "토큰이 없습니다. 메일의 링크를 다시 확인해주세요.";
  if (code === "empty") return "새 비밀번호를 입력해주세요.";
  if (code === "short") return "비밀번호는 8자 이상이어야 합니다.";
  if (code === "mismatch") return "비밀번호 확인이 일치하지 않습니다.";
  if (code === "not_found") return "유효하지 않은 링크입니다.";
  if (code === "expired") return "링크가 만료되었습니다 (1시간 초과). 비밀번호 찾기를 다시 요청해주세요.";
  if (code === "used") return "이미 사용된 링크입니다. 비밀번호 찾기를 다시 요청해주세요.";
  if (code === "deactivated") return "탈퇴 처리된 계정입니다. 학교 관리자에게 복구를 요청해주세요.";
  return "비밀번호 재설정에 실패했습니다.";
}

// 토큰 유효성 미리 점검 (페이지 첫 노출 시 만료/사용/탈퇴 알림용)
async function preflightToken(token: string): Promise<
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "used" | "deactivated" }
> {
  const { rows } = await pool.query<{
    expires_at: Date;
    used_at: Date | null;
    deactivated_at: Date | null;
  }>(
    `SELECT t.expires_at, t.used_at, s.deactivated_at
       FROM password_reset_tokens t
       JOIN students s
         ON s.school_id = t.student_school_id AND s.user_id = t.student_user_id
      WHERE t.token = $1`,
    [token],
  );
  const t = rows[0];
  if (!t) return { ok: false, reason: "not_found" };
  if (t.used_at) return { ok: false, reason: "used" };
  if (t.deactivated_at) return { ok: false, reason: "deactivated" };
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  // 토큰 없으면 안내
  if (!token) {
    return (
      <ShellMessage
        title="잘못된 접근"
        body="이 페이지는 메일로 받은 비밀번호 재설정 링크를 통해서만 접근할 수 있습니다."
      />
    );
  }

  // 미리 검증 (만료/사용 토큰이면 폼 안 보여주고 안내)
  const preflight = await preflightToken(token);
  if (!preflight.ok) {
    return (
      <ShellMessage
        title="링크 사용 불가"
        body={errorMessage(preflight.reason) ?? "유효하지 않은 링크입니다."}
        retry
      />
    );
  }

  const errMsg = errorMessage(errCode);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#fafafa" }}>
      <NavBar hideAuth />
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-6">
            <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
              새 비밀번호 설정
            </h1>
            <p className="mt-1.5 text-[12.5px] text-[#5f6b7a]">
              8자 이상으로 설정해주세요.
            </p>
          </div>

          <form
            action={resetPasswordAction}
            className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] p-6 space-y-4"
          >
            <input type="hidden" name="token" value={token} />

            <Field id="next" label="새 비밀번호" autoFocus />
            <Field id="confirm" label="새 비밀번호 확인" />

            {errMsg && (
              <div className="rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
                {errMsg}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-md bg-[#0972d3] text-white text-[14px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer"
            >
              비밀번호 변경
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  autoFocus,
}: {
  id: string;
  label: string;
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
        minLength={8}
        autoComplete="new-password"
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[14px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
      />
    </div>
  );
}

function ShellMessage({
  title,
  body,
  retry,
}: {
  title: string;
  body: string;
  retry?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#fafafa" }}>
      <NavBar hideAuth />
      <div className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[400px]">
          <div className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] p-6 text-center">
            <h1 className="text-[18px] font-bold text-[#16191f]">{title}</h1>
            <p className="mt-3 text-[13px] text-[#414d5c] leading-relaxed">{body}</p>
            <div className="mt-5 flex items-center justify-center gap-4 text-[13px]">
              {retry && (
                <Link
                  href="/login/recover?type=password"
                  className="text-[#0972d3] font-semibold hover:underline cursor-pointer"
                >
                  비밀번호 찾기 다시 요청
                </Link>
              )}
              <Link
                href="/login"
                className="text-[#5f6b7a] hover:text-[#0972d3] hover:underline cursor-pointer"
              >
                로그인으로
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
