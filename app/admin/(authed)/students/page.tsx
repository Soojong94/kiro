import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { PasswordField } from "@/components/PasswordField";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  createStudentAction,
  deleteStudentAction,
  resetStudentPasswordAction,
} from "./actions";

export const metadata = {
  title: "학생 계정 관리 · Kiro 관리자",
};

interface SchoolRow {
  id: string;
  name: string;
}
interface StudentRow {
  schoolId: string;
  schoolName: string;
  userId: string;
  realName: string;
  username: string | null;
  email: string | null;
  mustChange: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

async function loadSchools(scopeSchoolId: string | null): Promise<SchoolRow[]> {
  if (scopeSchoolId) {
    const { rows } = await pool.query<SchoolRow>(
      `SELECT id, name FROM schools WHERE id = $1`,
      [scopeSchoolId],
    );
    return rows;
  }
  const { rows } = await pool.query<SchoolRow>(
    `SELECT id, name FROM schools ORDER BY name`,
  );
  return rows;
}

async function loadStudents(
  scopeSchoolId: string | null,
  filter: { q: string; schoolFilter: string | null },
): Promise<StudentRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];

  // scope (학교 어드민) 이 있으면 자기 학교로 강제 — filter 무시
  if (scopeSchoolId) {
    params.push(scopeSchoolId);
    conds.push(`s.school_id = $${params.length}`);
  } else if (filter.schoolFilter) {
    params.push(filter.schoolFilter);
    conds.push(`s.school_id = $${params.length}`);
  }

  if (filter.q) {
    params.push(`%${filter.q}%`);
    const p = `$${params.length}`;
    conds.push(
      `(s.real_name ILIKE ${p} OR s.username ILIKE ${p} OR s.email ILIKE ${p})`,
    );
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `
    SELECT s.school_id, sc.name AS school_name, s.user_id, s.real_name,
           s.username, s.email, s.must_change_password,
           to_char(s.last_login_at, 'YYYY-MM-DD HH24:MI') AS last_login_at,
           to_char(s.created_at,    'YYYY-MM-DD')         AS created_at
      FROM students s
      JOIN schools sc ON sc.id = s.school_id
     ${where}
     ORDER BY sc.name, s.real_name
  `;
  const { rows } = await pool.query<{
    school_id: string;
    school_name: string;
    user_id: string;
    real_name: string;
    username: string | null;
    email: string | null;
    must_change_password: boolean;
    last_login_at: string | null;
    created_at: string;
  }>(sql, params);
  return rows.map((r) => ({
    schoolId: r.school_id,
    schoolName: r.school_name,
    userId: r.user_id,
    realName: r.real_name,
    username: r.username,
    email: r.email,
    mustChange: r.must_change_password,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  }));
}

const FORM_ERRORS: Record<string, string> = {
  required: "필수 항목이 비어있습니다.",
  username_format: "아이디 형식: 영문/숫자/._- 만 가능, 3~32자.",
  email_format: "이메일 형식이 올바르지 않습니다.",
  password_short: "초기 비밀번호는 8자 이상이어야 합니다.",
  username_taken: "이미 사용 중인 아이디입니다.",
  email_taken: "이미 등록된 이메일입니다.",
  reset_invalid: "재발급 입력값이 올바르지 않습니다 (비번 8자 이상).",
  not_found: "대상 학생을 찾을 수 없습니다.",
  invalid: "요청이 올바르지 않습니다.",
};

const OK_MSGS: Record<string, string> = {
  created: "학생 계정이 생성되었습니다.",
  reset: "비밀번호가 재발급되었습니다.",
  deleted: "학생이 제거되었습니다.",
};

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const okCode = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const errMsg = errCode ? FORM_ERRORS[errCode] ?? "오류가 발생했습니다." : null;
  const okMsg = okCode ? OK_MSGS[okCode] ?? null : null;

  // 필터 (URL searchParams)
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const schoolFilter =
    (Array.isArray(sp.school_filter) ? sp.school_filter[0] : sp.school_filter) ?? "";

  const [schools, students] = await Promise.all([
    loadSchools(admin.schoolId),
    loadStudents(admin.schoolId, { q, schoolFilter: schoolFilter || null }),
  ]);
  const isFiltered = !!q || !!schoolFilter;

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f]">
          학생 계정 관리
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          {admin.role === "super"
            ? "전 조직의 학생을 관리합니다."
            : `${admin.schoolId} 학교의 학생만 관리할 수 있습니다.`}
        </p>
      </header>

      <div className="mb-6 rounded-md bg-[#f2f8fd] ring-1 ring-[#cce4f5] px-4 py-3 text-[12.5px] text-[#033160]">
        <strong>학생 계정은 AWS IAM Identity Center 에서 자동 등록됩니다.</strong>{" "}
        IC 그룹에 사용자를 추가하면 다음 sync (매일 02:15 UTC) 가 학생 행을 만듭니다.
        <br />
        아래 <em>수동 추가</em> 폼은 <strong>Kiro 를 사용하지 않는 뷰어 계정</strong>
        (학교 운영자 등) 발급 전용입니다. 이 계정은 랭킹에 노출되지 않습니다 (사용량 데이터 없음).
      </div>

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

      {/* 수동 추가 폼 (뷰어 계정용) — 기본 접힘 */}
      <details className="mb-8 rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]">
        <summary className="cursor-pointer px-5 py-3 text-[13.5px] font-semibold text-[#16191f] hover:bg-[#fafafa] select-none rounded-lg">
          ＋ 수동 추가 (뷰어 계정용)
        </summary>
        <div className="px-5 pb-5 pt-1">
          <form action={createStudentAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
            <FormField label="학교" required>
              {admin.role === "super" ? (
                <select
                  name="school_id"
                  required
                  defaultValue=""
                  className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white"
                >
                  <option value="" disabled>학교 선택…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
              ) : (
                <>
                  <input type="hidden" name="school_id" value={admin.schoolId ?? ""} />
                  <input
                    type="text"
                    value={`${schools[0]?.name ?? ""} (${admin.schoolId ?? ""})`}
                    disabled
                    className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-[#f4f5f5] text-[#5f6b7a]"
                  />
                </>
              )}
            </FormField>

            <FormField label="실명" required>
              <Input name="real_name" placeholder="홍길동" required />
            </FormField>

            <FormField label="아이디" required>
              <Input name="username" placeholder="hong.gildong" required />
            </FormField>

            <FormField label="이메일" required>
              <Input name="email" type="email" placeholder="hong@school.kr" required />
            </FormField>

            <FormField label="초기 비밀번호 (8자 이상)" required>
              <PasswordField name="initial_password" required minLength={8} />
            </FormField>

            <div className="flex items-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-[#232f3e] text-white text-[13px] font-semibold hover:bg-[#161e2d] transition-colors cursor-pointer"
              >
                계정 발급
              </button>
            </div>
          </form>
        </div>
      </details>

      {/* 학생 리스트 */}
      <section className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#eaeded] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-bold text-[#16191f] shrink-0">
            등록 학생 {students.length}명 {isFiltered && <span className="text-[12px] font-normal text-[#5f6b7a]">(필터 적용)</span>}
          </h2>
          <form method="get" className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              placeholder="실명/아이디/이메일 검색"
              defaultValue={q}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px] w-48 focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
            {admin.role === "super" && (
              <select
                name="school_filter"
                defaultValue={schoolFilter}
                className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px]"
              >
                <option value="">전체 학교</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md bg-[#232f3e] text-white text-[12px] font-semibold hover:bg-[#161e2d] cursor-pointer"
            >
              검색
            </button>
            {isFiltered && (
              <a
                href="/admin/students"
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
                <Th>학교</Th>
                <Th>실명</Th>
                <Th>아이디</Th>
                <Th>이메일</Th>
                <Th>최근 로그인</Th>
                <Th>발급일</Th>
                <Th>액션</Th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#5f6b7a]">
                    아직 등록된 학생이 없습니다.
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr key={`${s.schoolId}/${s.userId}`} className="border-t border-[#f4f5f6]">
                  <Td>{s.schoolName}</Td>
                  <Td className="font-semibold text-[#16191f]">{s.realName}</Td>
                  <Td>
                    {s.username ?? <span className="text-[#95a5b8]">—</span>}
                    {s.mustChange && s.username && (
                      <span className="ml-1.5 text-[10px] font-bold text-[#ec7211]">
                        ↻
                      </span>
                    )}
                  </Td>
                  <Td className="text-[#414d5c]">{s.email ?? "—"}</Td>
                  <Td className="text-[#5f6b7a] tabular-nums">{s.lastLoginAt ?? "—"}</Td>
                  <Td className="text-[#5f6b7a] tabular-nums">{s.createdAt}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <ResetForm schoolId={s.schoolId} userId={s.userId} />
                      <DeleteForm
                        schoolId={s.schoolId}
                        userId={s.userId}
                        realName={s.realName}
                      />
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

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>,
) {
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

function ResetForm({
  schoolId,
  userId,
}: {
  schoolId: string;
  userId: string;
}) {
  return (
    <form action={resetStudentPasswordAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="user_id" value={userId} />
      <PasswordField
        name="new_password"
        placeholder="새 비번"
        required
        minLength={8}
        size="small"
      />
      <button
        type="submit"
        className="px-2 py-1 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[11px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer"
      >
        재발급
      </button>
    </form>
  );
}

function DeleteForm({
  schoolId,
  userId,
  realName,
}: {
  schoolId: string;
  userId: string;
  realName: string;
}) {
  return (
    <form action={deleteStudentAction}>
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="user_id" value={userId} />
      <ConfirmSubmitButton
        message={`'${realName}' 학생을 삭제합니다. 누적 사용량/모델 사용량도 함께 삭제됩니다. 진행할까요?`}
        className="px-2 py-1 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[11px] font-semibold text-[#7c2c2c] hover:bg-[#fdf2f0]"
        title={`'${realName}' 삭제`}
      >
        제거
      </ConfirmSubmitButton>
    </form>
  );
}
