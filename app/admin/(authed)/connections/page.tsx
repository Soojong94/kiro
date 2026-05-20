import { redirect } from "next/navigation";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";
import {
  createConnectionAction,
  deleteConnectionAction,
  testConnectionAction,
  updateConnectionAction,
} from "./actions";

export const metadata = {
  title: "AWS 연결 · Kiro 관리자",
};

interface ConnRow {
  id: string;
  name: string;
  awsAccountId: string | null;
  icInstanceId: string | null;
  icRegion: string;
  s3Bucket: string | null;
  s3Prefix: string | null;
  s3Region: string;
  roleArn: string | null;
  schoolCount: number;
  createdAt: string;
}

const FORM_ERRORS: Record<string, string> = {
  id_required: "id는 필수입니다.",
  id_format: "id 형식: 소문자/숫자/_- 만, 2~32자, 영문자로 시작.",
  id_taken: "이미 사용 중인 id입니다.",
  name_required: "이름은 필수입니다.",
  account_id_format: "AWS 계정 ID는 12자리 숫자여야 합니다.",
  has_schools: "이 connection 에 속한 학교가 있어 삭제 불가.",
  not_found: "대상 connection 을 찾을 수 없습니다.",
};

const OK_MSGS: Record<string, string> = {
  created: "Connection 이 추가되었습니다. 다음 sync 부터 적용됩니다.",
  updated: "Connection 정보가 갱신되었습니다.",
  deleted: "Connection 이 삭제되었습니다.",
};

export default async function ConnectionsPage({
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

  // 테스트 결과 (testConnectionAction 후 리다이렉트)
  const testOk = Array.isArray(sp.test_ok) ? sp.test_ok[0] : sp.test_ok;
  const testSummary = Array.isArray(sp.summary) ? sp.summary[0] : sp.summary;
  const testError = Array.isArray(sp.test_error) ? sp.test_error[0] : sp.test_error;
  const testErrId = Array.isArray(sp.test_id) ? sp.test_id[0] : sp.test_id;

  const { rows } = await pool.query<{
    id: string;
    name: string;
    aws_account_id: string | null;
    ic_instance_id: string | null;
    ic_region: string;
    s3_bucket: string | null;
    s3_prefix: string | null;
    s3_region: string;
    role_arn: string | null;
    school_count: string;
    created_at: string;
  }>(
    `SELECT c.id, c.name, c.aws_account_id, c.ic_instance_id, c.ic_region,
            c.s3_bucket, c.s3_prefix, c.s3_region, c.role_arn,
            (SELECT count(*) FROM schools WHERE connection_id = c.id)::text AS school_count,
            to_char(c.created_at, 'YYYY-MM-DD') AS created_at
       FROM connections c
      ORDER BY c.id`,
  );
  const conns: ConnRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    awsAccountId: r.aws_account_id,
    icInstanceId: r.ic_instance_id,
    icRegion: r.ic_region,
    s3Bucket: r.s3_bucket,
    s3Prefix: r.s3_prefix,
    s3Region: r.s3_region,
    roleArn: r.role_arn,
    schoolCount: Number(r.school_count),
    createdAt: r.created_at,
  }));

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f]">
            AWS 연결 (Connections)
          </h1>
          <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
            AWS 계정 단위 인제스트 출처. 한 connection 이 여러 학교(IC 그룹)를 호스팅합니다.
          </p>
        </div>
        <a
          href="/guides/aws-connection-guide.pdf"
          target="_blank"
          rel="noopener noreferrer"
          download
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer"
        >
          📖 가이드 PDF ↓
        </a>
      </header>

      <div className="mb-6 rounded-md bg-[#f2f8fd] ring-1 ring-[#cce4f5] px-4 py-3 text-[12.5px] text-[#033160]">
        <strong>새 학교가 자기 AWS 계정으로 합류하면 여기서 connection 1건 등록.</strong>
        {" "}그러면 sync-identity-center 가 그쪽 IC 의 그룹/사용자를 학교/학생으로 자동 import,
        ingest 가 그쪽 S3 의 Kiro CSV 를 가져옵니다.
        <br />
        cross-account 인 경우 <code>role_arn</code> 만 채우면 STS AssumeRole 로 접근.
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
      {testOk && (
        <div className="mb-4 rounded-md bg-[#f1f8f5] ring-1 ring-[#9bd4b7] px-4 py-3 text-[12.5px] text-[#1d6638]">
          <div className="font-bold text-[13.5px]">
            ✅ <span className="font-mono">{testOk}</span> 연결 검증 통과
          </div>
          {testSummary && (
            <div className="mt-1 text-[12px] text-[#1d6638]">{testSummary}</div>
          )}
          <div className="mt-2 text-[12px] text-[#1d6638]">
            <strong>00:00 KST 자정에 자동 sync</strong>, <strong>11:05 KST 에 사용량 ingest</strong> 됩니다.
          </div>
        </div>
      )}
      {testError && (
        <div className="mb-4 rounded-md bg-[#fdf2f0] ring-1 ring-[#f1c0bf] px-4 py-3 text-[12.5px] text-[#7c2c2c]">
          <div className="font-bold text-[13.5px]">
            ❌ <span className="font-mono">{testErrId ?? ""}</span> 연결 검증 실패
          </div>
          <div className="mt-1 text-[12px] font-mono break-all">{testError}</div>
          <div className="mt-2 text-[12px]">
            가이드 PDF §1 (IAM 권한) 또는 §5 (문제 해결) 참고.
          </div>
        </div>
      )}

      {/* 신규 등록 폼 (접힘) */}
      <details className="mb-8 rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]">
        <summary className="cursor-pointer px-5 py-3 text-[13.5px] font-semibold text-[#16191f] hover:bg-[#fafafa] select-none rounded-lg">
          ＋ 새 connection 등록
        </summary>
        <div className="px-5 pb-5 pt-1">
          <form
            action={createConnectionAction}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]"
          >
            <FormField label="id (예: chosun-univ-aws)" required>
              <Input name="id" required placeholder="lowercase, 2~32자, 영문자 시작" />
            </FormField>
            <FormField label="표시명" required>
              <Input name="name" required placeholder="조선대학교 AWS" />
            </FormField>
            <FormField label="AWS 계정 ID (12자리)">
              <Input name="aws_account_id" placeholder="123456789012" />
            </FormField>
            <FormField label="Role ARN (cross-account 시)">
              <Input name="role_arn" placeholder="arn:aws:iam::111122223333:role/kiro-read" />
            </FormField>
            <FormField label="IC 인스턴스 ID">
              <Input name="ic_instance_id" placeholder="d-1234567890" />
            </FormField>
            <FormField label="IC 리전">
              <Input name="ic_region" defaultValue="us-east-1" />
            </FormField>
            <FormField label="S3 버킷">
              <Input name="s3_bucket" placeholder="kiro-some-school" />
            </FormField>
            <FormField label="S3 prefix">
              <Input name="s3_prefix" placeholder="kiro_report" />
            </FormField>
            <FormField label="S3 리전">
              <Input name="s3_region" defaultValue="ap-northeast-2" />
            </FormField>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-[#232f3e] text-white text-[13px] font-semibold hover:bg-[#161e2d] cursor-pointer"
              >
                등록
              </button>
            </div>
          </form>
        </div>
      </details>

      {/* 목록 — 각 행 펼치면 편집 폼 */}
      <section className="space-y-3">
        {conns.length === 0 && (
          <div className="rounded-lg bg-white p-8 text-center text-[#5f6b7a] ring-1 ring-[#eaeded]">
            등록된 connection 이 없습니다.
          </div>
        )}
        {conns.map((c) => (
          <details
            key={c.id}
            className="rounded-lg bg-white ring-1 ring-[#eaeded] shadow-[0_1px_2px_rgba(0,28,36,0.05)]"
          >
            <summary className="cursor-pointer px-5 py-3 hover:bg-[#fafafa] select-none rounded-lg">
              <div className="inline-flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[13px] font-bold text-[#16191f]">{c.id}</span>
                <span className="text-[13px] text-[#414d5c]">{c.name}</span>
                <span className="text-[11.5px] text-[#5f6b7a]">
                  · 학교 {c.schoolCount}곳 · IC {c.icInstanceId ? "✓" : "미설정"} · S3{" "}
                  {c.s3Bucket ? "✓" : "미설정"} · {c.createdAt}
                </span>
              </div>
            </summary>
            <div className="px-5 pb-5 pt-1 border-t border-[#eaeded] mt-1">
              <form
                action={updateConnectionAction}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]"
              >
                <input type="hidden" name="id" value={c.id} />
                <FormField label="id (변경 불가)">
                  <input
                    value={c.id}
                    disabled
                    className="w-full px-2.5 py-1.5 rounded-md ring-1 ring-[#d5dbdb] bg-[#f4f5f5] text-[#5f6b7a] font-mono"
                  />
                </FormField>
                <FormField label="표시명" required>
                  <Input name="name" required defaultValue={c.name} />
                </FormField>
                <FormField label="AWS 계정 ID">
                  <Input
                    name="aws_account_id"
                    defaultValue={c.awsAccountId ?? ""}
                    placeholder="123456789012"
                  />
                </FormField>
                <FormField label="Role ARN (cross-account 시)">
                  <Input
                    name="role_arn"
                    defaultValue={c.roleArn ?? ""}
                    placeholder="arn:aws:iam::...:role/..."
                  />
                </FormField>
                <FormField label="IC 인스턴스 ID">
                  <Input
                    name="ic_instance_id"
                    defaultValue={c.icInstanceId ?? ""}
                    placeholder="d-..."
                  />
                </FormField>
                <FormField label="IC 리전">
                  <Input name="ic_region" defaultValue={c.icRegion} />
                </FormField>
                <FormField label="S3 버킷">
                  <Input name="s3_bucket" defaultValue={c.s3Bucket ?? ""} />
                </FormField>
                <FormField label="S3 prefix">
                  <Input name="s3_prefix" defaultValue={c.s3Prefix ?? ""} />
                </FormField>
                <FormField label="S3 리전">
                  <Input name="s3_region" defaultValue={c.s3Region} />
                </FormField>
                <div className="sm:col-span-2 flex justify-between items-center pt-2 flex-wrap gap-2">
                  {/* 같은 form 안에서 formAction 으로 액션 분기 — form 중첩 금지 */}
                  <ConfirmSubmitButton
                    formAction={deleteConnectionAction}
                    message={`'${c.id}' connection 을 삭제합니다. 진행할까요? (속한 학교가 있으면 차단됨)`}
                    className="px-3 py-1.5 rounded-md bg-white ring-1 ring-[#f1c0bf] text-[12px] font-semibold text-[#7c2c2c] hover:bg-[#fdf2f0]"
                  >
                    삭제
                  </ConfirmSubmitButton>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      formAction={testConnectionAction}
                      className="px-3.5 py-2 rounded-md bg-white ring-1 ring-[#d5dbdb] text-[12.5px] font-semibold text-[#414d5c] hover:bg-[#f2f3f3] cursor-pointer"
                      title="STS / IC / S3 접근 검증 — DB 변경 없음"
                    >
                      📡 연결 테스트
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-md bg-[#0972d3] text-white text-[13px] font-semibold hover:bg-[#033160] cursor-pointer"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </details>
        ))}
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
