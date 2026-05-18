// 학생 일괄 등록용 CSV 템플릿 다운로드.
// 어드민이 다운받아 엑셀에서 수정 후 업로드 → 일괄 INSERT.
// UTF-8 BOM 포함 — Excel 에서 한글 깨짐 방지.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

const SAMPLE_ROWS: string[][] = [
  [
    "school_id",
    "user_id",
    "real_name",
    "cohort",
    "username",
    "email",
    "initial_password",
  ],
  [
    "snu",
    "",
    "홍길동",
    "2026-1학년",
    "hong.gildong",
    "hong@school.kr",
    "initial1234",
  ],
  [
    "snu",
    "00000000-0000-4000-8000-000000000099",
    "김철수",
    "2026-1학년",
    "kim.chulsoo",
    "kim@school.kr",
    "welcome5678",
  ],
];

function escapeCsvField(s: string): string {
  // 쉼표/큰따옴표/개행 들어있으면 큰따옴표로 감싸고 내부 큰따옴표는 두 개로
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  // 로그인 안 한 사람에게 템플릿 노출 X — Route Handler 에선 throw 대신 redirect
  const s = await getSession();
  if (!s.adminId || !s.role) redirect("/admin/login");

  const body =
    "﻿" +
    SAMPLE_ROWS.map((row) => row.map(escapeCsvField).join(",")).join("\r\n") +
    "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="kiro-students-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
