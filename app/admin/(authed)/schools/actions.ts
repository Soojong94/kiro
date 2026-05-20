"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAudit, requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

function ensureSuper(role: string): void {
  if (role !== "super") {
    throw new Error("forbidden: super admin only");
  }
}

type Kind = "high_school" | "university" | "region";

function parseForm(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "") as Kind,
    isInternal: formData.get("is_internal") === "1",
  };
}

function validate(data: ReturnType<typeof parseForm>): string | null {
  if (!data.name) return "name_required";
  if (!["high_school", "university", "region"].includes(data.kind)) {
    return "kind_invalid";
  }
  return null;
}

// 학교 편집 — 이름 / 구분 / 사내 표시 만 수정. S3/IC 설정은 connections 에서.
export async function updateSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/schools?error=id_required");
  const data = parseForm(formData);
  const err = validate({ ...data, id });
  if (err) redirect(`/admin/schools/${id}/edit?error=${err}`);

  const { rowCount } = await pool.query(
    `UPDATE schools
        SET name = $2, kind = $3, is_internal = $4
      WHERE id = $1`,
    [id, data.name, data.kind, data.isInternal],
  );
  if (!rowCount) redirect("/admin/schools?error=not_found");

  await recordAudit(me.username, "school.update", id, {
    name: data.name,
    is_internal: data.isInternal,
  });
  revalidatePath("/admin/schools");
  revalidatePath(`/admin/schools/${id}/edit`);
  redirect("/admin/schools?ok=updated");
}

// 학교 관련 삭제 — 3가지 모드:
//   기본 (플래그 없음): 학생/사용량 둘 다 없을 때만 학교 삭제
//   students_only=1:   학생만 wipe. 학교/사용량 보존 (학생 교체 용도)
//   purge=1:           학교 + 학생 + 사용량 + 스냅샷 + 인제스트 로그 wipe (학교 id 입력 확인 필수)
export async function deleteSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const studentsOnly = String(formData.get("students_only") ?? "") === "1";
  const purge = String(formData.get("purge") ?? "") === "1";
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/schools?error=id_required");

  // 카운트 — 분기 + 감사 로그용. ingest_runs 는 connection 단위라 학교 삭제로 안 건드림.
  const { rows: countRows } = await pool.query<{
    students: string;
    usage: string;
    model_usage: string;
  }>(
    `SELECT
       (SELECT count(*) FROM students    WHERE school_id = $1)::text AS students,
       (SELECT count(*) FROM daily_usage WHERE school_id = $1)::text AS usage,
       (SELECT count(*) FROM model_usage WHERE school_id = $1)::text AS model_usage`,
    [id],
  );
  const counts = {
    students: Number(countRows[0].students),
    usage: Number(countRows[0].usage),
    modelUsage: Number(countRows[0].model_usage),
  };

  // ── students_only: 학생 + 학생들이 만든 데이터 wipe. 학교 + 인제스트 로그 보존.
  //    "이 학교 학생들의 흔적 정리" 한 묶음. 학교는 살아있어서 신입생 재등록 가능.
  if (studentsOnly) {
    if (counts.students === 0 && counts.usage === 0) {
      redirect(`/admin/schools/${id}/edit?error=no_students`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM ranking_snapshot          WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM monthly_champion_snapshot WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM model_usage               WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM daily_usage               WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM students                  WHERE school_id = $1`, [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    await recordAudit(me.username, "school.students_wipe", id, {
      students_deleted: counts.students,
      usage_deleted: counts.usage,
      model_usage_deleted: counts.modelUsage,
    });
    revalidatePath("/admin/schools");
    revalidatePath(`/admin/schools/${id}/edit`);
    redirect(`/admin/schools/${id}/edit?ok=students_wiped`);
  }

  // ── purge: 모든 데이터 + 학교 삭제 (학교 id 타이핑 확인 필수) ─────
  if (purge) {
    if (confirm !== id) {
      redirect(`/admin/schools/${id}/edit?error=purge_confirm`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM ranking_snapshot WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM monthly_champion_snapshot WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM model_usage WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM daily_usage WHERE school_id = $1`, [id]);
      if (counts.students > 0) {
        await client.query(`DELETE FROM students WHERE school_id = $1`, [id]);
      }
      const { rowCount } = await client.query(`DELETE FROM schools WHERE id = $1`, [id]);
      if (!rowCount) {
        await client.query("ROLLBACK");
        redirect("/admin/schools?error=not_found");
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    await recordAudit(me.username, "school.purge", id, {
      students_deleted: counts.students,
      usage_deleted: counts.usage,
      model_usage_deleted: counts.modelUsage,
    });
    revalidatePath("/admin/schools");
    redirect("/admin/schools?ok=purged");
  }

  // ── 기본: 학생/사용량 둘 다 없어야만 학교 삭제 ──────────────────
  if (counts.usage > 0) {
    redirect(`/admin/schools/${id}/edit?error=has_usage&count=${counts.usage}`);
  }
  if (counts.students > 0) {
    redirect(`/admin/schools/${id}/edit?error=has_students&count=${counts.students}`);
  }

  const { rowCount } = await pool.query(`DELETE FROM schools WHERE id = $1`, [id]);
  if (!rowCount) redirect("/admin/schools?error=not_found");

  await recordAudit(me.username, "school.delete", id, { mode: "safe" });
  revalidatePath("/admin/schools");
  redirect("/admin/schools?ok=deleted");
}
