// AWS IAM Identity Center 의 그룹/사용자를 우리 DB 의 schools/students 로 일괄 import.
// 학교 어드민의 수기 학생 등록을 대체 — Kiro 사용자가 그대로 우리 학생.
//
// 동작 (현재: TBIT 단일 계정 모델):
//   1) tbit-kiro-edu 인스턴스 검색 (us-east-1)
//   2) 그룹 리스트 → schools 테이블 (id = 그룹 이름) — 신규만 등록, 기존 name 유지
//   3) 각 그룹의 멤버 → students 테이블 (user_id = AWS UUID, username = AWS UserName)
//   4) 신규 학생만 랜덤 초기 비번 생성 + samples/credentials/*.csv 저장 → 어드민이 학생에 전달
//   5) 학생 첫 로그인 시 must_change_password=true 라 강제 비번 변경 화면으로
//
// TODO: cross-account 모델 (새 학교 자기 AWS 계정 + 자기 Identity Center 가질 때):
//   - schools.role_arn 있으면 그 학교에 한해 STS AssumeRole 후 그쪽 store 조회
//   - 그 store 의 사용자 전체 = 해당 학교 학생 (그룹 매핑 단계 생략 가능)
//   - 구현 패턴은 ingest/s3.ts 의 makeS3Client(school) 와 동일
//
// 실행:
//   npm run sync-identity-center            # 실제 적용
//   npm run sync-identity-center -- --dry   # DB 안 건드리고 미리보기

import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import {
  SSOAdminClient,
  ListInstancesCommand,
} from "@aws-sdk/client-sso-admin";
import {
  IdentitystoreClient,
  ListGroupsCommand,
  ListUsersCommand,
  ListGroupMembershipsCommand,
  type Group,
  type User,
} from "@aws-sdk/client-identitystore";
import { hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db";
import type { SchoolKind } from "@/lib/types";

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

const REGION = "us-east-1"; // tbit-kiro-edu 가 있는 리전
const INSTANCE_NAME = "tbit-kiro-edu";

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

async function main() {
  console.log(`[sync-id] ${dryRun ? "DRY RUN — DB 변경 없음" : "실제 sync 시작"}`);

  // 1) 인스턴스 검색
  const sso = new SSOAdminClient({ region: REGION });
  const inst = (await sso.send(new ListInstancesCommand({}))).Instances?.find(
    (i) => i.Name === INSTANCE_NAME,
  );
  if (!inst) {
    console.error(`[sync-id] ❌ '${INSTANCE_NAME}' 인스턴스 못 찾음 in ${REGION}`);
    process.exit(1);
  }
  const storeId = inst.IdentityStoreId!;
  console.log(`[sync-id] ✓ ${INSTANCE_NAME} (${storeId})`);

  const store = new IdentitystoreClient({ region: REGION });

  // 2) 그룹 목록
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
  console.log(`[sync-id] ✓ 그룹 ${groups.length}개`);

  // 3) 사용자 목록 (한 번에 다 받음 — 49명 정도라 부담 없음)
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
  console.log(`[sync-id] ✓ 사용자 ${users.length}명`);
  const userById = new Map(users.map((u) => [u.UserId!, u]));

  // 4) 그룹 멤버십 — userId → 첫 매칭 그룹 (한 학생이 두 그룹 이상이면 첫 그룹 사용)
  const userToGroup = new Map<string, string>(); // userId → groupName
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
          console.log(`  ⚠ 사용자 ${uid} 가 여러 그룹: 이미 '${existing}', '${g.DisplayName}' 무시`);
        } else {
          userToGroup.set(uid, g.DisplayName!);
        }
      }
      nextToken = res.NextToken;
    } while (nextToken);
  }
  console.log(`[sync-id] ✓ 그룹 매핑 ${userToGroup.size}건`);

  const orphanUsers = users.filter((u) => !userToGroup.has(u.UserId!));
  if (orphanUsers.length) {
    console.log(`[sync-id] ⚠ 그룹 미할당 사용자 ${orphanUsers.length}명 (skip):`);
    for (const u of orphanUsers) {
      console.log(`    - ${u.UserName} (${userFullName(u)})`);
    }
  }

  // 5) DB 적용
  const schoolStats = new Map<string, number>();
  // 신규 비번 생성된 학생들 (어드민이 받아갈 자료) — 기존 비번은 절대 안 건드림.
  const newCredentials: {
    schoolId: string;
    username: string;
    realName: string;
    email: string;
    initialPassword: string;
  }[] = [];

  for (const [uid, groupName] of userToGroup) {
    const meta = SCHOOL_MAP[groupName] ?? { name: groupName, kind: "region" as SchoolKind };
    schoolStats.set(groupName, (schoolStats.get(groupName) ?? 0) + 1);

    const u = userById.get(uid)!;
    const username = u.UserName ?? null;
    const email = u.Emails?.[0]?.Value ?? null;
    const realName = userFullName(u);

    if (dryRun) continue;

    // 학교: 신규만 등록, 기존은 그대로 (어드민이 /admin/schools 에서 이름 바꿔도 sync 가 안 덮음)
    await pool.query(
      `INSERT INTO schools (id, name, kind)
         VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [groupName, meta.name, meta.kind],
    );

    // 기존 비번 있으면 유지, 없으면 신규 생성 — sync 반복 실행에 안전.
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
      await pool.query(
        `INSERT INTO students
           (school_id, user_id, real_name, cohort, username, email,
            password_hash, must_change_password)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, true)
         ON CONFLICT (school_id, user_id) DO UPDATE SET
           real_name     = EXCLUDED.real_name,
           username      = EXCLUDED.username,
           email         = EXCLUDED.email,
           password_hash = COALESCE(students.password_hash, EXCLUDED.password_hash)`,
        [groupName, uid, realName, username, email, passwordHash],
      );
      if (plainPassword && username && email) {
        newCredentials.push({
          schoolId: groupName,
          username,
          realName,
          email,
          initialPassword: plainPassword,
        });
      }
    } catch (err: unknown) {
      const e = err as { code?: string; constraint?: string; message?: string };
      console.log(`    ❌ ${username} (${realName}): ${e.message}`);
    }
  }

  // 5b) 신규 생성된 자격증명 별도 CSV 로 저장 — 어드민이 학생에게 전달.
  if (!dryRun && newCredentials.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = "./samples/credentials";
    await mkdir(dir, { recursive: true });
    const out = `${dir}/initial-credentials-${ts}.csv`;
    const header = "school_id,username,real_name,email,initial_password";
    const lines = newCredentials.map((c) =>
      [c.schoolId, c.username, c.realName, c.email, c.initialPassword]
        .map(csvEscape)
        .join(","),
    );
    await writeFile(out, "﻿" + [header, ...lines].join("\r\n") + "\r\n", "utf-8");
    console.log(`\n📋 신규 ${newCredentials.length}명 초기 비번 → ${out}`);
    console.log("   ⚠ 이 파일은 git 에 안 올라감 (.gitignore). 학생들에게 전달 후 삭제 권장.");
  }

  // 6) 요약
  console.log("\n" + "─".repeat(80));
  console.log("학교별 import 학생 수");
  console.log("─".repeat(80));
  for (const [g, n] of schoolStats) {
    const meta = SCHOOL_MAP[g] ?? { name: g, kind: "region" };
    console.log(`  ${g.padEnd(20)} → ${meta.name.padEnd(20)} ${n} 명`);
  }
  console.log("─".repeat(80));
  console.log(
    dryRun
      ? "DRY RUN 종료 — DB 변경 없음. 실 적용은 --dry 빼고 다시 실행."
      : "✅ sync 완료. 학생들은 /login/recover?type=password 에서 이메일로 첫 비번 받아 사용.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[sync-id] 실패:", err);
  process.exit(1);
});
