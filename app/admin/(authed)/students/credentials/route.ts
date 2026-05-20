// 초기 비밀번호 일괄 CSV 다운로드 — 슈퍼 어드민 전용.
//
// GET /admin/students/credentials?school_id=<id|all>
//   - school_id="" 또는 "all": 전체 학교
//   - school_id="chosun-univ": 해당 학교만
//
// 컬럼: 대학교, 이름, 아이디, 이메일, 초기 비밀번호
// 학생이 비번을 바꿔도 initial_password 컬럼은 그대로 유지 (변경 후 비번은 학생 본인 관리).

import { NextResponse } from "next/server";
import { recordAudit, requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface CredRow {
  school_name: string;
  real_name: string;
  username: string | null;
  email: string | null;
  initial_password: string;
}

export async function GET(request: Request): Promise<Response> {
  const me = await requireAdmin();
  if (me.role !== "super") {
    return new NextResponse("Forbidden — super admin only", { status: 403 });
  }

  const url = new URL(request.url);
  const schoolParam = (url.searchParams.get("school_id") ?? "").trim();
  const isAll = schoolParam === "" || schoolParam === "all";

  const query = isAll
    ? `SELECT sc.name AS school_name, s.real_name, s.username, s.email, s.initial_password
         FROM students s JOIN schools sc ON sc.id = s.school_id
        WHERE s.initial_password IS NOT NULL
        ORDER BY sc.name, s.real_name`
    : `SELECT sc.name AS school_name, s.real_name, s.username, s.email, s.initial_password
         FROM students s JOIN schools sc ON sc.id = s.school_id
        WHERE s.initial_password IS NOT NULL AND s.school_id = $1
        ORDER BY s.real_name`;
  const params = isAll ? [] : [schoolParam];

  const { rows } = await pool.query<CredRow>(query, params);

  const header = "대학교,이름,아이디,이메일,초기 비밀번호";
  const lines = rows.map((r) =>
    [r.school_name, r.real_name, r.username ?? "", r.email ?? "", r.initial_password]
      .map(csvEscape)
      .join(","),
  );
  // UTF-8 BOM + 윈도우 줄바꿈 (Excel 한글 호환)
  const body = "﻿" + [header, ...lines].join("\r\n") + "\r\n";

  await recordAudit(
    me.username,
    "students.credentials_download",
    isAll ? "all" : schoolParam,
    { count: rows.length },
  );

  const ts = new Date().toISOString().slice(0, 10);
  const filename = `kiro-initial-credentials-${isAll ? "all" : schoolParam}-${ts}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
