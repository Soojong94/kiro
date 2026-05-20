// AWS IAM Identity Center 그룹/사용자를 schools/students 로 import.
//
// connection 단위로 동작 — `connections.ic_instance_id` + `ic_region` 사용.
// 한 connection 은 N 학교(=IC 그룹) 호스팅. cross-account 시 connections.role_arn 으로 AssumeRole.
//
// 동작:
//   1) connections 의 모든 행 순회 (ic_instance_id 가 있는 것만)
//   2) 필요 시 STS AssumeRole 후 IdentitystoreClient 생성
//   3) IC 그룹 리스트 → schools (id=그룹명, connection_id=이 connection)
//   4) 각 그룹 멤버 → students (user_id=AWS UUID, username=AWS UserName)
//   5) 신규 학생만 랜덤 초기 비번 + samples/credentials/*.csv 저장
//   6) 학생 첫 로그인 시 must_change_password=true 라 강제 변경
//
// 실행:
//   npm run sync-identity-center            # 실제 적용
//   npm run sync-identity-center -- --dry   # DB 안 건드리고 미리보기

import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import {
  IdentitystoreClient,
  ListGroupsCommand,
  ListUsersCommand,
  ListGroupMembershipsCommand,
  type Group,
  type User,
} from "@aws-sdk/client-identitystore";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db";
import type { Connection, SchoolKind } from "@/lib/types";

const BASE_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

// 헷갈리는 문자(0/O, 1/l/I) 제외한 10자 랜덤 비번 — 학생에게 전달 / 첫 로그인 시 강제 변경.
function generateInitialPassword(): string {
  const charset = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += charset.charAt(bytes[i] % charset.length);
  }
  return s;
}

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 그룹 이름 → 학교 초기 display name. 어드민이 /admin/schools 에서 바꾸면 그 값 유지.
// 매핑 없는 그룹은 그룹 이름 그대로 + kind=region.
const SCHOOL_MAP: Record<string, { name: string; kind: SchoolKind }> = {
  tbit: { name: "TBIT (사내)", kind: "region" },
  "chosun-univ": { name: "조선대학교", kind: "university" },
  "gwangju-univ": { name: "광주대학교", kind: "university" },
};

const dryRun = process.argv.includes("--dry") || process.argv.includes("--dry-run");

function userFullName(u: User): string {
  const family = u.Name?.FamilyName ?? "";
  const given = u.Name?.GivenName ?? "";
  return `${family}${given}`.trim() || u.DisplayName || u.UserName || "?";
}

async function makeIdentityStoreClient(conn: Connection): Promise<IdentitystoreClient> {
  if (!conn.roleArn) {
    return new IdentitystoreClient({ region: conn.icRegion });
  }
  const sts = new STSClient({ region: BASE_REGION });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: conn.roleArn,
      RoleSessionName: `kiro-icsync-${conn.id}`,
      DurationSeconds: 3600,
    }),
  );
  if (!Credentials) throw new Error(`AssumeRole failed for connection ${conn.id}`);
  return new IdentitystoreClient({
    region: conn.icRegion,
    credentials: {
      accessKeyId: Credentials.AccessKeyId!,
      secretAccessKey: Credentials.SecretAccessKey!,
      sessionToken: Credentials.SessionToken,
    },
  });
}

interface NewCred {
  schoolId: string;
  username: string;
  realName: string;
  email: string;
  initialPassword: string;
}

async function syncConnection(conn: Connection, allNewCreds: NewCred[]): Promise<void> {
  if (!conn.icInstanceId) {
    console.log(`[sync-id] skip connection=${conn.id} — ic_instance_id 없음`);
    return;
  }
  console.log(`\n[sync-id] connection=${conn.id} store=${conn.icInstanceId} region=${conn.icRegion}`);

  const store = await makeIdentityStoreClient(conn);
  const storeId = conn.icInstanceId;

  // 그룹 목록
  const groups: Group[] = [];
  {
    let nextToken: string | undefined;
    do {
      const res = await store.send(
        new ListGroupsCommand({ IdentityStoreId: storeId, NextToken: nextToken, MaxResults: 100 }),
      );
      groups.push(...(res.Groups ?? []));
      nextToken = res.NextToken;
    } while (nextToken);
  }
  console.log(`  ✓ 그룹 ${groups.length}개`);

  // 사용자 목록
  const users: User[] = [];
  {
    let nextToken: string | undefined;
    do {
      const res = await store.send(
        new ListUsersCommand({ IdentityStoreId: storeId, NextToken: nextToken, MaxResults: 100 }),
      );
      users.push(...(res.Users ?? []));
      nextToken = res.NextToken;
    } while (nextToken);
  }
  console.log(`  ✓ 사용자 ${users.length}명`);
  const userById = new Map(users.map((u) => [u.UserId!, u]));

  // 그룹 멤버십 — userId → 첫 매칭 그룹
  const userToGroup = new Map<string, string>();
  for (const g of groups) {
    let nextToken: string | undefined;
    do {
      const res = await store.send(
        new ListGroupMembershipsCommand({
          IdentityStoreId: storeId,
          GroupId: g.GroupId!,
          NextToken: nextToken,
          MaxResults: 100,
        }),
      );
      for (const m of res.GroupMemberships ?? []) {
        const uid = m.MemberId?.UserId;
        if (!uid) continue;
        if (userToGroup.has(uid)) {
          const existing = userToGroup.get(uid)!;
          console.log(`    ⚠ 사용자 ${uid} 여러 그룹: 이미 '${existing}', '${g.DisplayName}' 무시`);
        } else {
          userToGroup.set(uid, g.DisplayName!);
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
  }
  console.log(`  ✓ 그룹 매핑 ${userToGroup.size}건`);

  const orphans = users.filter((u) => !userToGroup.has(u.UserId!));
  if (orphans.length) {
    console.log(`  ⚠ 그룹 미할당 ${orphans.length}명 (skip)`);
  }

  // DB 적용
  const stats = new Map<string, number>();
  for (const [uid, groupName] of userToGroup) {
    const meta = SCHOOL_MAP[groupName] ?? { name: groupName, kind: "region" as SchoolKind };
    stats.set(groupName, (stats.get(groupName) ?? 0) + 1);

    const u = userById.get(uid)!;
    const username = u.UserName ?? null;
    const email = u.Emails?.[0]?.Value ?? null;
    const realName = userFullName(u);

    if (dryRun) continue;

    // 학교: 신규만 등록 (connection_id 도 같이 세팅). 기존이면 이름/kind 안 덮음.
    await pool.query(
      `INSERT INTO schools (id, name, kind, connection_id)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET connection_id = COALESCE(schools.connection_id, EXCLUDED.connection_id)`,
      [groupName, meta.name, meta.kind, conn.id],
    );

    // 기존 비번 유지, 없으면 신규 생성
    const existing = await pool.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM students WHERE school_id = $1 AND user_id = $2`,
      [groupName, uid],
    );
    const existingHash = existing.rows[0]?.password_hash ?? null;

    let plainPassword: string | null = null;
    let passwordHash: string | null = existingHash;
    if (!existingHash) {
      plainPassword = generateInitialPassword();
      passwordHash = await hashPassword(plainPassword);
    }

    try {
      // ON CONFLICT DO NOTHING — 기존 학생은 절대 건드리지 않음.
      // 신규 학생만 INSERT 되면서 initial_password (평문) 도 같이 저장 →
      // 어드민이 /admin/students 에서 학교별 일괄 다운로드 가능.
      // initial_password 는 한 번 채워지면 영구 유지 (학생이 비번 바꿔도 안 건드림) —
      // 어드민이 "최초 발급 비번이 뭐였더라" 다시 확인할 수 있게.
      const inserted = await pool.query<{ user_id: string }>(
        `INSERT INTO students
           (school_id, user_id, real_name, cohort, username, email,
            password_hash, must_change_password, initial_password)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, true, $7)
         ON CONFLICT (school_id, user_id) DO NOTHING
         RETURNING user_id`,
        [groupName, uid, realName, username, email, passwordHash, plainPassword],
      );
      const wasNew = inserted.rowCount === 1;
      if (wasNew && plainPassword && username && email) {
        allNewCreds.push({
          schoolId: groupName,
          username,
          realName,
          email,
          initialPassword: plainPassword,
        });
      }
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.log(`    ❌ ${username} (${realName}): ${e.message}`);
    }
  }

  // 학교별 카운트 요약
  console.log("  학교별 import:");
  for (const [g, n] of stats) {
    const meta = SCHOOL_MAP[g] ?? { name: g };
    console.log(`    ${g.padEnd(20)} → ${meta.name.padEnd(20)} ${n}명`);
  }
}

async function main() {
  console.log(`[sync-id] ${dryRun ? "DRY RUN — DB 변경 없음" : "실제 sync 시작"}`);

  // connections 의 IC 설정된 행 모두 처리
  const { rows: connRows } = await pool.query<{
    id: string;
    name: string;
    aws_account_id: string | null;
    ic_instance_id: string | null;
    ic_region: string;
    s3_bucket: string | null;
    s3_prefix: string | null;
    s3_region: string;
    role_arn: string | null;
  }>(`SELECT * FROM connections WHERE ic_instance_id IS NOT NULL`);

  if (connRows.length === 0) {
    console.warn("[sync-id] ic_instance_id 가 설정된 connection 없음 — connections 테이블 확인");
    await pool.end();
    return;
  }

  const allNewCreds: NewCred[] = [];

  for (const r of connRows) {
    const conn: Connection = {
      id: r.id,
      name: r.name,
      awsAccountId: r.aws_account_id ?? undefined,
      icInstanceId: r.ic_instance_id ?? undefined,
      icRegion: r.ic_region,
      s3Bucket: r.s3_bucket ?? undefined,
      s3Prefix: r.s3_prefix ?? undefined,
      s3Region: r.s3_region,
      roleArn: r.role_arn ?? undefined,
    };
    try {
      await syncConnection(conn, allNewCreds);
    } catch (err) {
      console.error(`[sync-id] connection=${conn.id} 실패:`, err);
    }
  }

  // 신규 비번 CSV 저장
  if (!dryRun && allNewCreds.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = "./samples/credentials";
    await mkdir(dir, { recursive: true });
    const out = `${dir}/initial-credentials-${ts}.csv`;
    const header = "school_id,username,real_name,email,initial_password";
    const lines = allNewCreds.map((c) =>
      [c.schoolId, c.username, c.realName, c.email, c.initialPassword]
        .map(csvEscape)
        .join(","),
    );
    await writeFile(out, "﻿" + [header, ...lines].join("\r\n") + "\r\n", "utf-8");
    console.log(`\n📋 신규 ${allNewCreds.length}명 초기 비번 → ${out}`);
    console.log("   ⚠ 이 파일은 git 에 안 올라감. 학생들에게 전달 후 삭제 권장.");
  }

  console.log(
    dryRun
      ? "\n✅ DRY RUN 종료 — DB 변경 없음."
      : "\n✅ sync 완료.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[sync-id] 실패:", err);
  process.exit(1);
});
