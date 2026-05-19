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

function isValidSchoolId(s: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(s);
}

function isValidAccountId(s: string): boolean {
  return /^\d{12}$/.test(s);
}

type Kind = "high_school" | "university" | "region";

function parseForm(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    kind: String(formData.get("kind") ?? "") as Kind,
    awsAccountId: String(formData.get("aws_account_id") ?? "").trim() || null,
    s3Bucket: String(formData.get("s3_bucket") ?? "").trim() || null,
    s3Prefix: String(formData.get("s3_prefix") ?? "").trim() || null,
    awsRegion: String(formData.get("aws_region") ?? "").trim() || "ap-northeast-2",
    roleArn: String(formData.get("role_arn") ?? "").trim() || null,
  };
}

function validate(
  data: ReturnType<typeof parseForm>,
  isUpdate: boolean,
): string | null {
  if (!isUpdate) {
    if (!data.id) return "id_required";
    if (!isValidSchoolId(data.id)) return "id_format";
  }
  if (!data.name) return "name_required";
  if (!["high_school", "university", "region"].includes(data.kind)) {
    return "kind_invalid";
  }
  if (data.awsAccountId && !isValidAccountId(data.awsAccountId)) {
    return "account_id_format";
  }
  return null;
}

export async function createSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const data = parseForm(formData);
  const err = validate(data, false);
  if (err) redirect(`/admin/schools?error=${err}`);

  try {
    await pool.query(
      `INSERT INTO schools
         (id, name, kind, aws_account_id, s3_bucket, s3_prefix, aws_region, role_arn)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.id,
        data.name,
        data.kind,
        data.awsAccountId,
        data.s3Bucket,
        data.s3Prefix,
        data.awsRegion,
        data.roleArn,
      ],
    );
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "23505") redirect("/admin/schools?error=id_taken");
    throw err;
  }

  await recordAudit(me.username, "school.create", data.id, {
    name: data.name,
    kind: data.kind,
  });
  revalidatePath("/admin/schools");
  redirect("/admin/schools?ok=created");
}

export async function updateSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/schools?error=id_required");
  const data = parseForm(formData);
  // id 는 PK 라 수정 불가 — 폼에서 받은 id 는 식별자
  const err = validate({ ...data, id }, true);
  if (err) redirect(`/admin/schools/${id}/edit?error=${err}`);

  const { rowCount } = await pool.query(
    `UPDATE schools
        SET name = $2, kind = $3, aws_account_id = $4,
            s3_bucket = $5, s3_prefix = $6, aws_region = $7, role_arn = $8
      WHERE id = $1`,
    [
      id,
      data.name,
      data.kind,
      data.awsAccountId,
      data.s3Bucket,
      data.s3Prefix,
      data.awsRegion,
      data.roleArn,
    ],
  );
  if (!rowCount) redirect("/admin/schools?error=not_found");

  await recordAudit(me.username, "school.update", id, { name: data.name });
  revalidatePath("/admin/schools");
  revalidatePath(`/admin/schools/${id}/edit`);
  redirect("/admin/schools?ok=updated");
}

// 학교 삭제 — 세 단계:
//   기본: 학생/사용량 둘 다 없을 때만
//   force=1: 학생만 있을 때 — 학생까지 정리
//   purge=1: 학생 + 사용량 + 스냅샷 + 인제스트 로그 전부 정리 (확인 텍스트 일치 필수)
export async function deleteSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const force = String(formData.get("force") ?? "") === "1";
  const purge = String(formData.get("purge") ?? "") === "1";
  const confirm = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/schools?error=id_required");

  // 카운트 조회 — 아래 분기 + 감사 로그용
  const { rows: countRows } = await pool.query<{
    students: string;
    usage: string;
    model_usage: string;
    runs: string;
  }>(
    `SELECT
       (SELECT count(*) FROM students    WHERE school_id = $1)::text AS students,
       (SELECT count(*) FROM daily_usage WHERE school_id = $1)::text AS usage,
       (SELECT count(*) FROM model_usage WHERE school_id = $1)::text AS model_usage,
       (SELECT count(*) FROM ingest_runs WHERE school_id = $1)::text AS runs`,
    [id],
  );
  const counts = {
    students: Number(countRows[0].students),
    usage: Number(countRows[0].usage),
    modelUsage: Number(countRows[0].model_usage),
    runs: Number(countRows[0].runs),
  };

  // purge 가 아니면서 사용량 데이터 있음 → 차단
  if (counts.usage > 0 && !purge) {
    redirect(`/admin/schools/${id}/edit?error=has_usage&count=${counts.usage}`);
  }
  // force/purge 가 아니면서 학생 있음 → 차단
  if (counts.students > 0 && !force && !purge) {
    redirect(`/admin/schools/${id}/edit?error=has_students&count=${counts.students}`);
  }
  // purge 는 안전장치: 학교 id 직접 입력 필수
  if (purge && confirm !== id) {
    redirect(`/admin/schools/${id}/edit?error=purge_confirm`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (purge) {
      // 사용량/스냅샷/인제스트 로그까지 모두 정리 (FK 없으니 순서는 자유)
      await client.query(`DELETE FROM ranking_snapshot WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM monthly_champion_snapshot WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM ingest_runs WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM model_usage WHERE school_id = $1`, [id]);
      await client.query(`DELETE FROM daily_usage WHERE school_id = $1`, [id]);
    }
    if (counts.students > 0) {
      // force 또는 purge 인 경우만 도달 (위 차단 통과)
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

  await recordAudit(me.username, "school.delete", id, {
    mode: purge ? "purge" : force ? "force" : "safe",
    students_deleted: counts.students,
    usage_deleted: purge ? counts.usage : 0,
    model_usage_deleted: purge ? counts.modelUsage : 0,
    ingest_runs_deleted: purge ? counts.runs : 0,
  });
  revalidatePath("/admin/schools");
  redirect(purge ? "/admin/schools?ok=purged" : "/admin/schools?ok=deleted");
}
