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

// 학교 삭제 — 학생/사용량 데이터 있으면 차단. force=true 면 트랜잭션 안에서 학생까지 정리.
// daily_usage / model_usage 같은 사용량 데이터는 보존을 위해 force 와 무관하게 차단.
export async function deleteSchoolAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const force = String(formData.get("force") ?? "") === "1";
  if (!id) redirect("/admin/schools?error=id_required");

  // 사용량 데이터가 있으면 force 와 무관하게 차단 (데이터 손실 방지)
  const { rows: usageRows } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM daily_usage WHERE school_id = $1`,
    [id],
  );
  if (Number(usageRows[0].c) > 0) {
    redirect(`/admin/schools?error=has_usage&id=${id}`);
  }

  const { rows: studentRows } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM students WHERE school_id = $1`,
    [id],
  );
  const studentCount = Number(studentRows[0].c);

  if (studentCount > 0 && !force) {
    redirect(`/admin/schools/${id}/edit?error=has_students&count=${studentCount}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (studentCount > 0) {
      // force=true 인 경우만 도달. 학생 행 명시적 삭제 후 학교 삭제.
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
    forced: force,
    students_deleted: studentCount,
  });
  revalidatePath("/admin/schools");
  redirect("/admin/schools?ok=deleted");
}
