import { redirect } from "next/navigation";
import { requireActiveStudent } from "@/lib/student-auth";
import { leaveAction } from "./actions";

export const metadata = {
  title: "회원 탈퇴 · Kiro 통합 랭킹",
};

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "empty") return "비밀번호를 입력해주세요.";
  if (code === "wrong") return "비밀번호가 올바르지 않습니다.";
  if (code === "unconfirmed") return "탈퇴 확인 체크박스를 선택해주세요.";
  return "탈퇴 처리에 실패했습니다.";
}

export default async function LeavePage({
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

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "#fafafa" }}
    >
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-6">
          <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
            회원 탈퇴
          </h1>
          <p className="text-[12.5px] text-[#5f6b7a] mt-2">
            {session.username} 님의 계정을 비활성화합니다.
          </p>
        </div>

        <div className="rounded-2xl border border-[#fad1d1] bg-[#fdf2f2] p-4 mb-4 text-[12.5px] text-[#7c2c2c] leading-relaxed">
          <div className="font-semibold mb-1">탈퇴 안내</div>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>로그인 / 비밀번호 찾기 · 재설정이 차단됩니다.</li>
            <li>대시보드 랭킹과 사용량 데이터는 그대로 노출됩니다 (마스킹된 이름).</li>
            <li>다시 로그인하려면 학교 관리자에게 복구 요청을 해야 합니다.</li>
          </ul>
        </div>

        <form
          action={leaveAction}
          className="rounded-2xl bg-white border border-[#eaeded] p-5 space-y-4"
        >
          <div>
            <label className="block text-[12px] font-semibold text-[#5f6b7a] mb-1.5">
              현재 비밀번호
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 rounded-lg border border-[#d5dbdb] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#0972d3]/30 focus:border-[#0972d3]"
            />
          </div>

          <label className="flex items-start gap-2 text-[12.5px] text-[#16191f] cursor-pointer">
            <input type="checkbox" name="confirm" className="mt-0.5" />
            <span>
              위 내용을 모두 확인했으며, 계정을 탈퇴하는 것에 동의합니다.
            </span>
          </label>

          {msg && (
            <p className="text-[12px] text-[#7c2c2c] bg-[#fdf2f2] border border-[#fad1d1] rounded-lg px-3 py-2">
              {msg}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <a
              href="/"
              className="flex-1 text-center px-4 py-2.5 rounded-lg border border-[#d5dbdb] text-[13.5px] font-semibold text-[#16191f] hover:bg-[#f4f5f7] transition-colors"
            >
              취소
            </a>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-[#7c2c2c] text-white text-[13.5px] font-semibold hover:bg-[#5a1f1f] transition-colors cursor-pointer"
            >
              탈퇴하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
