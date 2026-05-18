import { redirect } from "next/navigation";
import { requireAdmin, type AdminRole } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  createAdminAction,
  deleteAdminAction,
  resetAdminPasswordAction,
} from "./actions";

export const metadata = {
  title: "관리자 계정 · Kiro 관리자",
};

interface AdminRow {
  id: number;
  username: string;
  role: AdminRole;
  schoolId: string | null;
  email: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

interface SchoolRow {
  id: string;
  name: string;
}

const FORM_ERRORS: Record<string, string> = {
  required: "아이디와 초기 비밀번호는 필수입니다.",
  username_format: "아이디 형식: 영문/숫자/._- 만 가능, 3~32자.",
  role_invalid: "역할 선택이 잘못되었습니다.",
  school_required: "학교 어드민은 학교를 지정해야 합니다.",
  email_format: "이메일 형식이 올바르지 않습니다.",
  password_short: "비밀번호는 8자 이상이어야 합니다.",
  username_taken: "이미 사용 중인 아이디입니다.",
  school_not_found: "해당 school_id 의 학교가 없습니다.",
  reset_invalid: "재발급 입력값이 올바르지 않습니다.",
  self_delete: "본인 계정은 삭제할 수 없습니다.",
  last_super: "마지막 슈퍼 어드민은 삭제할 수 없습니다.",
  not_found: "대상 어드민을 찾을 수 없습니다.",
  invalid: "요청이 올바르지 않습니다.",
};
const OK_MSGS: Record<string, string> = {
  created: "관리자가 추가되었습니다.",
  reset: "비밀번호가 재설정되었습니다.",
  deleted: "관리자가 삭제되었습니다.",
};

export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  if (me.role !== "super") {
    redirect("/admin");
  }

  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const okCode = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const errMsg = errCode ? FORM_ERRORS[errCode] ?? "오류가 발생했습니다." : null;
  const okMsg = okCode ? OK_MSGS[okCode] ?? null : null;

  // 필터
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const roleFilter = (Array.isArray(sp.role_filter) ? sp.role_filter[0] : sp.role_filter) ?? "";
  const schoolFilter = (Array.isArray(sp.school_filter) ? sp.school_filter[0] : sp.school_filter) ?? "";
  const isFiltered = !!q || !!roleFilter || !!schoolFilter;

  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    conds.push(`(username ILIKE ${p} OR email ILIKE ${p})`);
  }
  if (roleFilter === "super" || roleFilter === "school") {
    params.push(roleFilter);
    conds.push(`role = $${params.length}`);
  }
  if (schoolFilter) {
    params.push(schoolFilter);
    conds.push(`school_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const [admins, schools] = await Promise.all([
    pool
      .query<{
        id: number;
        username: string;
        role: AdminRole;
        school_id: string | null;
        email: string | null;
        last_login_at: string | null;
        created_at: string;
      }>(
        `SELECT id, username, role, school_id, email,
                to_char(last_login_at, 'YYYY-MM-DD HH24:MI') AS last_login_at,
                to_char(created_at,    'YYYY-MM-DD')          AS created_at
           FROM admins ${where} ORDER BY role DESC, username`,
        params,
      )
      .then(({ rows }): AdminRow[] =>
        rows.map((r) => ({
          id: r.id,
          username: r.username,
          role: r.role,
          schoolId: r.school_id,
          email: r.email,
          lastLoginAt: r.last_login_at,
          createdAt: r.created_at,
        })),
      ),
    pool
      .query<SchoolRow>(`SELECT id, name FROM schools ORDER BY name`)
      .then(({ rows }) => rows),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f]">
          관리자 계정
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          슈퍼는 전체, 학교 어드민은 본인 학교만 접근합니다.
        </p>
      </header>

      {okMsg && (
        <div className="mb-4 rounded-md bg-[#f1f8f5] ring-1 ring-[#9bd4b7] px-3 py-2 text-[12.5px] text-[#1d6638]">
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="mb-4 rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
          {errMsg}
        </div>
      )}

      {/* 생성 폼 */}
      <section className="mb-8 rounded-lg bg-white p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]">
        <h2 className="text-[15px] font-bold text-[#16191f] mb-3">
          새 관리자 추가
        </h2>
        <form action={createAdminAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
          <FormField label="아이디" required>
            <Input name="username" placeholder="snu.admin" required />
          </FormField>
          <FormField label="역할" required>
            <select
              name="role"
              required
              defaultValue="school"
              className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px]"
            >
              <option value="school">학교 어드민</option>
              <option value="super">슈퍼 어드민 (TBT)</option>
            </select>
          </FormField>
          <FormField label="학교 (school 역할 필수)">
            <select
              name="school_id"
              defaultValue=""
              className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px]"
            >
              <option value="">없음 (super)</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
              ))}
            </select>
          </FormField>
          <FormField label="이메일">
            <Input name="email" type="email" placeholder="admin@school.kr" />
          </FormField>
          <FormField label="초기 비밀번호 (8자 이상)" required>
            <Input name="initial_password" type="text" required />
          </FormField>
          <div className="flex items-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-[#232f3e] text-white text-[13px] font-semibold hover:bg-[#161e2d] transition-colors"
            >
              추가
            </button>
          </div>
        </form>
      </section>

      {/* 어드민 리스트 */}
      <section className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#eaeded] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-bold text-[#16191f] shrink-0">
            등록 관리자 {admins.length}명 {isFiltered && <span className="text-[12px] font-normal text-[#5f6b7a]">(필터 적용)</span>}
          </h2>
          <form method="get" className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              placeholder="아이디/이메일 검색"
              defaultValue={q}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px] w-44 focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
            <select
              name="role_filter"
              defaultValue={roleFilter}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px]"
            >
              <option value="">전체 역할</option>
              <option value="super">슈퍼</option>
              <option value="school">학교</option>
            </select>
            <select
              name="school_filter"
              defaultValue={schoolFilter}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px]"
            >
              <option value="">전체 학교</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md bg-[#232f3e] text-white text-[12px] font-semibold hover:bg-[#161e2d] cursor-pointer"
            >
              검색
            </button>
            {isFiltered && (
              <a
                href="/admin/admins"
                className="px-3 py-1.5 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12px] font-semibold text-[#5f6b7a] hover:bg-[#f2f3f3] cursor-pointer"
              >
                초기화
              </a>
            )}
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#fafafa] text-[11.5px] text-[#5f6b7a]">
              <tr>
                <Th>아이디</Th>
                <Th>역할</Th>
                <Th>학교</Th>
                <Th>이메일</Th>
                <Th>최근 로그인</Th>
                <Th>생성일</Th>
                <Th>액션</Th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} className="border-t border-[#f4f5f6]">
                  <Td className="font-semibold text-[#16191f]">{a.username}</Td>
                  <Td>
                    {a.role === "super" ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#ec7211] text-white text-[10px] font-bold">
                        SUPER
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#0972d3] text-white text-[10px] font-bold">
                        SCHOOL
                      </span>
                    )}
                  </Td>
                  <Td className="text-[#414d5c]">{a.schoolId ?? "—"}</Td>
                  <Td className="text-[#414d5c]">{a.email ?? "—"}</Td>
                  <Td className="text-[#5f6b7a] tabular-nums">{a.lastLoginAt ?? "—"}</Td>
                  <Td className="text-[#5f6b7a] tabular-nums">{a.createdAt}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <ResetForm adminId={a.id} />
                      {a.id !== me.adminId && (
                        <DeleteForm adminId={a.id} username={a.username} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function FormField({
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
      <span className="block text-[11.5px] font-semibold text-[#414d5c] mb-1">
        {label}
        {required && <span className="ml-0.5 text-[#d13212]">*</span>}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px] text-[#16191f] focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
    />
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-middle whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}

function ResetForm({ adminId }: { adminId: number }) {
  return (
    <form action={resetAdminPasswordAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="admin_id" value={adminId} />
      <input
        type="text"
        name="new_password"
        placeholder="새 비번"
        required
        minLength={8}
        className="w-24 px-2 py-1 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[11px]"
      />
      <button
        type="submit"
        className="px-2 py-1 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[11px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3]"
      >
        재발급
      </button>
    </form>
  );
}

function DeleteForm({ adminId, username }: { adminId: number; username: string }) {
  return (
    <form action={deleteAdminAction}>
      <input type="hidden" name="admin_id" value={adminId} />
      <button
        type="submit"
        className="px-2 py-1 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[11px] font-semibold text-[#7c2c2c] hover:bg-[#fdf2f0]"
        title={`'${username}' 삭제`}
      >
        삭제
      </button>
    </form>
  );
}
