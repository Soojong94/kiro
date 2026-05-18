"use server";

import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { revalidatePath } from "next/cache";
import {
  assertSchoolScope,
  hashPassword,
  recordAudit,
  requireAdmin,
} from "@/lib/auth";
import { pool } from "@/lib/db";

export interface RowError {
  row: number;
  reason: string;
  preview?: string;
}

export interface BulkResult {
  ok: number;
  failed: number;
  errors: RowError[];
  fatal?: string; // 파일 자체 문제 (파싱 실패 등)
}

const EMPTY: BulkResult = { ok: 0, failed: 0, errors: [] };

function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(u);
}

function isValidEmail(e: string): boolean {
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function bulkCreateStudentsAction(
  _prev: BulkResult | null,
  formData: FormData,
): Promise<BulkResult> {
  const me = await requireAdmin();

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ...EMPTY, fatal: "CSV 파일을 선택해주세요." };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ...EMPTY, fatal: "파일이 너무 큽니다 (2MB 초과)." };
  }

  const bytes = await file.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      ...EMPTY,
      fatal: `CSV 파싱 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (records.length === 0) {
    return { ...EMPTY, fatal: "데이터 행이 없습니다." };
  }
  if (records.length > 500) {
    return { ...EMPTY, fatal: "한 번에 최대 500행까지만 처리합니다." };
  }

  const errors: RowError[] = [];
  let okCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const rowNum = i + 2; // 1행은 헤더
    const preview = `${r.real_name ?? "?"} / ${r.username ?? "?"}`;

    // school 어드민은 행의 school_id 무시하고 본교 강제
    const schoolId =
      me.role === "school" ? me.schoolId ?? "" : (r.school_id ?? "").trim();
    const userId = (r.user_id ?? "").trim() || randomUUID();
    const realName = (r.real_name ?? "").trim();
    const cohort = (r.cohort ?? "").trim() || null;
    const username = (r.username ?? "").trim();
    const email = (r.email ?? "").trim().toLowerCase();
    const password = r.initial_password ?? "";

    if (!schoolId || !realName || !username || !email || !password) {
      errors.push({ row: rowNum, reason: "필수 필드 누락", preview });
      continue;
    }
    if (!isValidUsername(username)) {
      errors.push({
        row: rowNum,
        reason: "username 형식: 영문/숫자/._- 만, 3~32자",
        preview,
      });
      continue;
    }
    if (!isValidEmail(email)) {
      errors.push({ row: rowNum, reason: "email 형식 오류", preview });
      continue;
    }
    if (password.length < 8) {
      errors.push({
        row: rowNum,
        reason: "initial_password 8자 이상 필요",
        preview,
      });
      continue;
    }

    try {
      assertSchoolScope(me.role, me.schoolId, schoolId);
    } catch {
      errors.push({
        row: rowNum,
        reason: `학교 권한 없음 (${schoolId})`,
        preview,
      });
      continue;
    }

    try {
      const hash = await hashPassword(password);
      await pool.query(
        `INSERT INTO students
           (school_id, user_id, real_name, cohort, username, password_hash, email, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [schoolId, userId, realName, cohort, username, hash, email],
      );
      okCount++;
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string };
      let reason = "INSERT 실패";
      if (e.code === "23505") {
        if (e.constraint?.includes("username"))
          reason = `이미 사용 중인 username: ${username}`;
        else if (e.constraint?.includes("email"))
          reason = `이미 등록된 email: ${email}`;
        else reason = `중복 키 — (학교/user_id) 또는 username/email 충돌`;
      } else if (e.code === "23503") {
        reason = `존재하지 않는 학교: ${schoolId}`;
      }
      errors.push({ row: rowNum, reason, preview });
    }
  }

  await recordAudit(me.username, "student.bulk_create", null, {
    ok: okCount,
    failed: errors.length,
    total: records.length,
  });

  revalidatePath("/admin/students");
  return { ok: okCount, failed: errors.length, errors };
}
