import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { UploadForm } from "./UploadForm";

export const metadata = { title: "학생 일괄 등록 · Kiro 관리자" };

export default async function StudentsUploadPage() {
  const me = await requireAdmin();
  const scopeNote =
    me.role === "school"
      ? `본교(${me.schoolId}) 학생만 등록됩니다. CSV 의 school_id 컬럼은 무시되고 본교로 강제됩니다.`
      : "전 학교 등록 가능. CSV 의 school_id 컬럼대로 분배됩니다.";

  return (
    <main className="mx-auto max-w-3xl px-5 sm:px-6 py-8">
      <Link
        href="/admin/students"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5f6b7a] hover:text-[#0972d3] cursor-pointer mb-3"
      >
        ← 학생 목록으로
      </Link>

      <header className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight text-[#16191f]">
          학생 일괄 등록
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          CSV 한 번에 여러 학생 계정을 발급합니다. 모든 학생은 첫 로그인 시 비밀번호를 변경하게 됩니다.
        </p>
      </header>

      {/* 안내 + 템플릿 다운로드 */}
      <section className="mb-5 rounded-lg bg-[#f2f8fd] ring-1 ring-[#cfe2f3] p-4">
        <h2 className="text-[13px] font-bold text-[#033160] mb-2">CSV 형식</h2>
        <ul className="space-y-1 text-[12px] text-[#414d5c] pl-4 list-disc">
          <li>컬럼: <code className="bg-white px-1 rounded">school_id, user_id, real_name, cohort, username, email, initial_password</code></li>
          <li><code className="bg-white px-1 rounded">user_id</code> 비워두면 자동 UUID 생성</li>
          <li><code className="bg-white px-1 rounded">cohort</code> 는 옵션, 나머지는 필수</li>
          <li>username: 영문/숫자/._- 3~32자 · password: 8자 이상</li>
        </ul>
        <a
          href="/admin/students/template"
          download
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white ring-1 ring-[#cfe2f3] text-[12.5px] font-semibold text-[#033160] hover:bg-[#e6f1fa] cursor-pointer"
        >
          ⬇ 템플릿 다운로드 (예시 2행 포함)
        </a>
      </section>

      <UploadForm scopeNote={scopeNote} />
    </main>
  );
}
