import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createSchoolAction } from "./actions";

export const metadata = {
  title: "학교 관리 · Kiro 관리자",
};

interface SchoolRow {
  id: string;
  name: string;
  kind: "high_school" | "university" | "region";
  awsAccountId: string | null;
  s3Bucket: string | null;
  s3Prefix: string | null;
  awsRegion: string;
  roleArn: string | null;
  studentCount: number;
  createdAt: string;
}

const KIND_LABEL: Record<SchoolRow["kind"], string> = {
  high_school: "고등학교",
  university: "대학교",
  region: "권역/기타",
};

const FORM_ERRORS: Record<string, string> = {
  id_required: "id는 필수입니다.",
  id_format: "id 형식: 소문자/숫자/_- 만, 2~32자, 영문자로 시작.",
  id_taken: "이미 사용 중인 id입니다.",
  name_required: "이름은 필수입니다.",
  kind_invalid: "구분 값이 올바르지 않습니다.",
  account_id_format: "AWS 계정 ID는 12자리 숫자여야 합니다.",
  has_usage: "사용량 데이터(daily_usage)가 있어 삭제할 수 없습니다. 운영자에게 문의하세요.",
  has_students: "학생이 등록된 학교는 일반 삭제 불가. 편집 페이지에서 강제 삭제하세요.",
  not_found: "대상 학교를 찾을 수 없습니다.",
};

const OK_MSGS: Record<string, string> = {
  created: "학교가 추가되었습니다.",
  updated: "학교 정보가 갱신되었습니다.",
  deleted: "학교가 삭제되었습니다.",
};

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  if (me.role !== "super") redirect("/admin");

  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const okCode = Array.isArray(sp.ok) ? sp.ok[0] : sp.ok;
  const errMsg = errCode ? FORM_ERRORS[errCode] ?? "오류가 발생했습니다." : null;
  const okMsg = okCode ? OK_MSGS[okCode] ?? null : null;

  // 필터
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const kindFilter = (Array.isArray(sp.kind) ? sp.kind[0] : sp.kind) ?? "";
  const isFiltered = !!q || !!kindFilter;

  const conds: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    conds.push(`(s.id ILIKE ${p} OR s.name ILIKE ${p})`);
  }
  if (kindFilter) {
    params.push(kindFilter);
    conds.push(`s.kind = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const { rows } = await pool.query<{
    id: string;
    name: string;
    kind: SchoolRow["kind"];
    aws_account_id: string | null;
    s3_bucket: string | null;
    s3_prefix: string | null;
    aws_region: string;
    role_arn: string | null;
    student_count: string;
    created_at: string;
  }>(
    `
    SELECT s.id, s.name, s.kind, s.aws_account_id, s.s3_bucket, s.s3_prefix,
           s.aws_region, s.role_arn,
           (SELECT count(*) FROM students WHERE school_id = s.id)::text AS student_count,
           to_char(s.created_at, 'YYYY-MM-DD') AS created_at
      FROM schools s
     ${where}
     ORDER BY s.name
  `,
    params,
  );
  const schools: SchoolRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    awsAccountId: r.aws_account_id,
    s3Bucket: r.s3_bucket,
    s3Prefix: r.s3_prefix,
    awsRegion: r.aws_region,
    roleArn: r.role_arn,
    studentCount: Number(r.student_count),
    createdAt: r.created_at,
  }));

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f]">
          학교 관리
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          학교 신규 등록 + S3 인제스트 설정. id 는 한 번 정하면 변경 불가입니다.
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

      {/* 신규 등록 */}
      <section className="mb-8 rounded-lg bg-white p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]">
        <h2 className="text-[15px] font-bold text-[#16191f] mb-3">새 학교 등록</h2>
        <form
          action={createSchoolAction}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]"
        >
          <FormField label="id (예: snu)" required>
            <Input name="id" required placeholder="lowercase, 2~32자" />
          </FormField>
          <FormField label="이름" required>
            <Input name="name" required placeholder="서울대학교" />
          </FormField>
          <FormField label="구분" required>
            <select
              name="kind"
              required
              defaultValue="university"
              className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px]"
            >
              <option value="university">대학교</option>
              <option value="high_school">고등학교</option>
              <option value="region">권역/기타</option>
            </select>
          </FormField>
          <FormField label="AWS 계정 ID (12자리 숫자)">
            <Input name="aws_account_id" placeholder="123456789012" />
          </FormField>
          <FormField label="S3 버킷명">
            <Input name="s3_bucket" placeholder="kiro-tbit" />
          </FormField>
          <FormField label="S3 prefix (옵션)">
            <Input name="s3_prefix" placeholder="tbit_kiro_test" />
          </FormField>
          <FormField label="AWS 리전">
            <Input
              name="aws_region"
              defaultValue="ap-northeast-2"
              placeholder="ap-northeast-2"
            />
          </FormField>
          <FormField label="Role ARN (cross-account)">
            <Input name="role_arn" placeholder="arn:aws:iam::...:role/..." />
          </FormField>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-[#232f3e] text-white text-[13px] font-semibold hover:bg-[#161e2d] transition-colors cursor-pointer"
            >
              등록
            </button>
          </div>
        </form>
      </section>

      {/* 리스트 */}
      <section className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#eaeded] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[15px] font-bold text-[#16191f] shrink-0">
            등록 학교 {schools.length}곳 {isFiltered && <span className="text-[12px] font-normal text-[#5f6b7a]">(필터 적용)</span>}
          </h2>
          <form method="get" className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              placeholder="id/이름 검색"
              defaultValue={q}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px] w-44 focus:outline-none focus:ring-2 focus:ring-[#0972d3]"
            />
            <select
              name="kind"
              defaultValue={kindFilter}
              className="px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[12.5px]"
            >
              <option value="">전체 구분</option>
              <option value="university">대학교</option>
              <option value="high_school">고등학교</option>
              <option value="region">권역/기타</option>
            </select>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md bg-[#232f3e] text-white text-[12px] font-semibold hover:bg-[#161e2d] cursor-pointer"
            >
              검색
            </button>
            {isFiltered && (
              <a
                href="/admin/schools"
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
                <Th>id</Th>
                <Th>이름</Th>
                <Th>구분</Th>
                <Th>학생 수</Th>
                <Th>S3 버킷</Th>
                <Th>리전</Th>
                <Th>생성일</Th>
                <Th>액션</Th>
              </tr>
            </thead>
            <tbody>
              {schools.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#5f6b7a]">
                    아직 등록된 학교가 없습니다.
                  </td>
                </tr>
              )}
              {schools.map((s) => (
                <tr key={s.id} className="border-t border-[#f4f5f6]">
                  <Td className="font-mono text-[#414d5c]">{s.id}</Td>
                  <Td className="font-semibold text-[#16191f]">{s.name}</Td>
                  <Td className="text-[#5f6b7a]">{KIND_LABEL[s.kind]}</Td>
                  <Td className="tabular-nums text-[#414d5c]">{s.studentCount}</Td>
                  <Td className="font-mono text-[11.5px] text-[#5f6b7a]">
                    {s.s3Bucket ?? "—"}
                    {s.s3Prefix && (
                      <span className="text-[#95a5b8]">/{s.s3Prefix}</span>
                    )}
                  </Td>
                  <Td className="text-[#5f6b7a]">{s.awsRegion}</Td>
                  <Td className="text-[#5f6b7a] tabular-nums">{s.createdAt}</Td>
                  <Td>
                    <Link
                      href={`/admin/schools/${s.id}/edit`}
                      className="px-2.5 py-1 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[11.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer"
                    >
                      편집
                    </Link>
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
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>
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
