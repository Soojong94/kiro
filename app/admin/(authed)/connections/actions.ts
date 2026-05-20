"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  IdentitystoreClient,
  ListGroupsCommand,
} from "@aws-sdk/client-identitystore";
import { recordAudit, requireAdmin } from "@/lib/auth";
import { pool } from "@/lib/db";

const BASE_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

function ensureSuper(role: string): void {
  if (role !== "super") throw new Error("forbidden: super admin only");
}

function isValidConnectionId(s: string): boolean {
  return /^[a-z][a-z0-9_-]{1,31}$/.test(s);
}

function isValidAccountId(s: string): boolean {
  return /^\d{12}$/.test(s);
}

function parseForm(formData: FormData) {
  return {
    id: String(formData.get("id") ?? "").trim().toLowerCase(),
    name: String(formData.get("name") ?? "").trim(),
    awsAccountId: String(formData.get("aws_account_id") ?? "").trim() || null,
    icInstanceId: String(formData.get("ic_instance_id") ?? "").trim() || null,
    icRegion: String(formData.get("ic_region") ?? "").trim() || "us-east-1",
    s3Bucket: String(formData.get("s3_bucket") ?? "").trim() || null,
    s3Prefix: String(formData.get("s3_prefix") ?? "").trim() || null,
    s3Region: String(formData.get("s3_region") ?? "").trim() || "ap-northeast-2",
    roleArn: String(formData.get("role_arn") ?? "").trim() || null,
  };
}

function validate(data: ReturnType<typeof parseForm>, isCreate: boolean): string | null {
  if (isCreate) {
    if (!data.id) return "id_required";
    if (!isValidConnectionId(data.id)) return "id_format";
  }
  if (!data.name) return "name_required";
  if (data.awsAccountId && !isValidAccountId(data.awsAccountId)) {
    return "account_id_format";
  }
  return null;
}

export async function createConnectionAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const data = parseForm(formData);
  const err = validate(data, true);
  if (err) redirect(`/admin/connections?error=${err}`);

  try {
    await pool.query(
      `INSERT INTO connections
         (id, name, aws_account_id, ic_instance_id, ic_region,
          s3_bucket, s3_prefix, s3_region, role_arn)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        data.id, data.name,
        data.awsAccountId, data.icInstanceId, data.icRegion,
        data.s3Bucket, data.s3Prefix, data.s3Region, data.roleArn,
      ],
    );
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === "23505") redirect("/admin/connections?error=id_taken");
    throw err;
  }

  await recordAudit(me.username, "connection.create", data.id, { name: data.name });
  revalidatePath("/admin/connections");
  redirect("/admin/connections?ok=created");
}

export async function updateConnectionAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/connections?error=id_required");
  const data = parseForm(formData);
  const err = validate({ ...data, id }, false);
  if (err) redirect(`/admin/connections?error=${err}`);

  const { rowCount } = await pool.query(
    `UPDATE connections
        SET name = $2, aws_account_id = $3, ic_instance_id = $4, ic_region = $5,
            s3_bucket = $6, s3_prefix = $7, s3_region = $8, role_arn = $9
      WHERE id = $1`,
    [
      id, data.name,
      data.awsAccountId, data.icInstanceId, data.icRegion,
      data.s3Bucket, data.s3Prefix, data.s3Region, data.roleArn,
    ],
  );
  if (!rowCount) redirect("/admin/connections?error=not_found");

  await recordAudit(me.username, "connection.update", id, { name: data.name });
  revalidatePath("/admin/connections");
  redirect("/admin/connections?ok=updated");
}

// connection 의 IAM / IC / S3 접근이 실제로 동작하는지 검증.
// 어떤 DB 변경도 안 함 — 그저 AWS API 호출 한 번씩 해보고 응답 받아 결과 표시.
//
// 성공 시: `?test_ok=<id>&summary=<요약>` 으로 리다이렉트
// 실패 시: `?test_error=<message>&test_id=<id>` 로 리다이렉트
export async function testConnectionAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/connections?error=id_required");

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
  }>(`SELECT * FROM connections WHERE id = $1`, [id]);
  const c = rows[0];
  if (!c) redirect("/admin/connections?error=not_found");

  const results: string[] = [];
  let errorMsg: string | null = null;

  try {
    // 1. STS AssumeRole (cross-account 시만)
    let credentials: {
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
    } | undefined;

    if (c.role_arn) {
      const sts = new STSClient({ region: BASE_REGION });
      const { Credentials } = await sts.send(
        new AssumeRoleCommand({
          RoleArn: c.role_arn,
          RoleSessionName: `kiro-test-${c.id}`,
          DurationSeconds: 900,
        }),
      );
      if (!Credentials?.AccessKeyId) throw new Error("AssumeRole 응답에 자격증명 없음");
      credentials = {
        accessKeyId: Credentials.AccessKeyId,
        secretAccessKey: Credentials.SecretAccessKey!,
        sessionToken: Credentials.SessionToken!,
      };
      results.push("STS AssumeRole ✓");
    }

    // 2. Identity Center 접근 확인 (그룹 카운트)
    if (c.ic_instance_id) {
      const store = new IdentitystoreClient({
        region: c.ic_region,
        credentials,
      });
      const r = await store.send(
        new ListGroupsCommand({
          IdentityStoreId: c.ic_instance_id,
          MaxResults: 100,
        }),
      );
      const groupCount = r.Groups?.length ?? 0;
      results.push(`IC 그룹 ${groupCount}개 ✓`);
    } else {
      results.push("IC 미설정 (skip)");
    }

    // 3. S3 접근 확인 (prefix 아래 객체 카운트)
    if (c.s3_bucket) {
      const s3 = new S3Client({ region: c.s3_region, credentials });
      const prefix = c.s3_prefix ? `${c.s3_prefix}/` : "";
      const r = await s3.send(
        new ListObjectsV2Command({
          Bucket: c.s3_bucket,
          Prefix: prefix,
          MaxKeys: 5,
        }),
      );
      const objCount = r.KeyCount ?? 0;
      results.push(`S3 객체 ${objCount}개 ✓`);
    } else {
      results.push("S3 미설정 (skip)");
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  await recordAudit(me.username, "connection.test", c.id, {
    ok: !errorMsg,
    results,
    error: errorMsg,
  });

  if (errorMsg) {
    redirect(
      `/admin/connections?test_error=${encodeURIComponent(errorMsg)}&test_id=${c.id}`,
    );
  }
  redirect(
    `/admin/connections?test_ok=${c.id}&summary=${encodeURIComponent(results.join(" / "))}`,
  );
}

export async function deleteConnectionAction(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  ensureSuper(me.role);

  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  if (!id) redirect("/admin/connections?error=id_required");

  // connection 에 연결된 학교가 있으면 삭제 차단 — 학교부터 connection 변경 또는 삭제
  const { rows: countRows } = await pool.query<{ schools: string }>(
    `SELECT count(*)::text AS schools FROM schools WHERE connection_id = $1`,
    [id],
  );
  const schoolCount = Number(countRows[0].schools);
  if (schoolCount > 0) {
    redirect(`/admin/connections?error=has_schools&count=${schoolCount}`);
  }

  const { rowCount } = await pool.query(`DELETE FROM connections WHERE id = $1`, [id]);
  if (!rowCount) redirect("/admin/connections?error=not_found");

  await recordAudit(me.username, "connection.delete", id, null);
  revalidatePath("/admin/connections");
  redirect("/admin/connections?ok=deleted");
}
