import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import { deleteSchoolAction, updateSchoolAction } from "../../actions";

export const metadata = { title: "학교 편집 · Kiro 관리자" };

const FORM_ERRORS: Record<string, string> = {
  name_required: "이름은 필수입니다.",
  kind_invalid: "구분 값이 올바르지 않습니다.",
  account_id_format: "AWS 계정 ID는 12자리 숫자여야 합니다.",
  has_students: "학생이 등록된 학교입니다. 강제 삭제 옵션을 확인하세요.",
};

export default async function EditSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  if (me.role !== "super") redirect("/admin");

  const { id } = await params;
  const sp = await searchParams;
  const errCode = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const studentCountStr = Array.isArray(sp.count) ? sp.count[0] : sp.count;
  const errMsg = errCode ? FORM_ERRORS[errCode] ?? "오류가 발생했습니다." : null;

  const { rows } = await pool.query<{
    id: string;
    name: string;
    kind: "high_school" | "university" | "region";
    aws_account_id: string | null;
    s3_bucket: string | null;
    s3_prefix: string | null;
    aws_region: string;
    role_arn: string | null;
  }>(
    `SELECT id, name, kind, aws_account_id, s3_bucket, s3_prefix, aws_region, role_arn
       FROM schools WHERE id = $1 LIMIT 1`,
    [id],
  );
  const school = rows[0];
  if (!school) notFound();

  // 학생/사용량 수 (삭제 차단 안내용)
  const { rows: ctRows } = await pool.query<{ students: string; usage: string }>(
    `SELECT
       (SELECT count(*) FROM students    WHERE school_id = $1)::text AS students,
       (SELECT count(*) FROM daily_usage WHERE school_id = $1)::text AS usage`,
    [id],
  );
  const counts = {
    students: Number(ctRows[0].students),
    usage: Number(ctRows[0].usage),
  };

  return (
    <main className="mx-auto max-w-3xl px-5 sm:px-6 py-8">
      <Link
        href="/admin/schools"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5f6b7a] hover:text-[#0972d3] cursor-pointer mb-3"
      >
        ← 학교 목록으로
      </Link>

      <header className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
          학교 편집
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          id <span className="font-mono">{school.id}</span> · 학생 {counts.students}명 · 사용량 레코드 {counts.usage}건
        </p>
      </header>

      {errMsg && (
        <div className="mb-4 rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-3 py-2 text-[12.5px] text-[#7c2c2c]">
          {errMsg}
          {errCode === "has_students" && studentCountStr && (
            <> · 영향 학생 {studentCountStr}명</>
          )}
        </div>
      )}

      {/* 편집 폼 */}
      <section className="rounded-lg bg-white p-5 ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)] mb-6">
        <form
          action={updateSchoolAction}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]"
        >
          <input type="hidden" name="id" value={school.id} />
          <FormField label="id (변경 불가)">
            <input
              value={school.id}
              disabled
              className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-[#f4f5f5] text-[#5f6b7a] font-mono"
            />
          </FormField>
          <FormField label="이름" required>
            <Input name="name" required defaultValue={school.name} />
          </FormField>
          <FormField label="구분" required>
            <select
              name="kind"
              required
              defaultValue={school.kind}
              className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-white text-[13px]"
            >
              <option value="university">대학교</option>
              <option value="high_school">고등학교</option>
              <option value="region">권역/기타</option>
            </select>
          </FormField>
          <FormField label="AWS 계정 ID">
            <Input
              name="aws_account_id"
              defaultValue={school.aws_account_id ?? ""}
              placeholder="123456789012"
            />
          </FormField>
          <FormField label="S3 버킷명">
            <Input
              name="s3_bucket"
              defaultValue={school.s3_bucket ?? ""}
              placeholder="kiro-tbit"
            />
          </FormField>
          <FormField label="S3 prefix">
            <Input
              name="s3_prefix"
              defaultValue={school.s3_prefix ?? ""}
              placeholder="tbit_kiro_test"
            />
          </FormField>
          <FormField label="AWS 리전">
            <Input name="aws_region" defaultValue={school.aws_region} />
          </FormField>
          <FormField label="Role ARN">
            <Input
              name="role_arn"
              defaultValue={school.role_arn ?? ""}
              placeholder="arn:aws:iam::...:role/..."
            />
          </FormField>
          <div className="sm:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-[#0972d3] text-white text-[13px] font-semibold hover:bg-[#033160] transition-colors cursor-pointer"
            >
              저장
            </button>
          </div>
        </form>
      </section>

      {/* 위험 영역 */}
      <section className="rounded-lg bg-white p-5 ring-1 ring-[#f1c0bf]">
        <h2 className="text-[14px] font-bold text-[#7c2c2c]">위험 영역 — 학교 삭제</h2>
        {counts.usage > 0 ? (
          <p className="mt-2 text-[12.5px] text-[#414d5c]">
            이 학교에 사용량 데이터(daily_usage) {counts.usage.toLocaleString()}건이 있어
            <strong className="text-[#7c2c2c]"> 삭제 불가</strong>입니다. 데이터 보존 정책.
          </p>
        ) : counts.students > 0 ? (
          <>
            <p className="mt-2 text-[12.5px] text-[#414d5c]">
              학생 <strong>{counts.students}명</strong>이 등록되어 있습니다. 일반 삭제 불가 —
              학생까지 함께 삭제하려면 강제 삭제 버튼을 사용하세요.
              <br />
              <span className="text-[11px] text-[#7c2c2c]">
                ⚠ 학생 행이 모두 삭제됩니다 (로그인 정보 포함). 되돌릴 수 없습니다.
              </span>
            </p>
            <form action={deleteSchoolAction} className="mt-3">
              <input type="hidden" name="id" value={school.id} />
              <input type="hidden" name="force" value="1" />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-[#d13212] text-white text-[12.5px] font-semibold hover:bg-[#9d2b15] transition-colors cursor-pointer"
              >
                학생 {counts.students}명 + 학교 강제 삭제
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-[12.5px] text-[#414d5c]">
              학생/사용량 데이터가 없습니다. 안전하게 삭제 가능합니다.
            </p>
            <form action={deleteSchoolAction} className="mt-3">
              <input type="hidden" name="id" value={school.id} />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md bg-[#7c2c2c] text-white text-[12.5px] font-semibold hover:bg-[#5e1f1f] transition-colors cursor-pointer"
              >
                학교 삭제
              </button>
            </form>
          </>
        )}
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
