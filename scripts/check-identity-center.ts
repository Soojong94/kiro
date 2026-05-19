// AWS IAM Identity Center 사용자 목록 + UUID 조회 가능 여부 검증.
// 성공하면 → 실제 운영 시 학생 UUID 자동 sync 가능 (Option B).
// 실패하면 → 권한 부족. 어떤 정책 필요한지 안내.
//
// 실행: npm run check-identity-center

import {
  SSOAdminClient,
  ListInstancesCommand,
} from "@aws-sdk/client-sso-admin";
import {
  IdentitystoreClient,
  ListUsersCommand,
  type User,
} from "@aws-sdk/client-identitystore";

// Identity Center 는 region-bound — 여러 리전에서 ListInstances 시도
const CANDIDATE_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "ap-northeast-2",
  "eu-west-1",
  "eu-central-1",
];

interface FoundInstance {
  region: string;
  identityStoreId: string;
  instanceArn: string;
  name?: string;
}

async function findInstances(): Promise<FoundInstance[]> {
  const found: FoundInstance[] = [];
  for (const region of CANDIDATE_REGIONS) {
    try {
      const client = new SSOAdminClient({ region });
      const res = await client.send(new ListInstancesCommand({}));
      for (const inst of res.Instances ?? []) {
        if (inst.IdentityStoreId && inst.InstanceArn) {
          found.push({
            region,
            identityStoreId: inst.IdentityStoreId,
            instanceArn: inst.InstanceArn,
            name: inst.Name,
          });
        }
      }
    } catch {
      // 권한/지역 미지원 등 — skip
    }
  }
  return found;
}

async function listUsers(
  identityStoreId: string,
  region: string,
): Promise<User[]> {
  const client = new IdentitystoreClient({ region });
  const out: User[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new ListUsersCommand({
        IdentityStoreId: identityStoreId,
        NextToken: nextToken,
        MaxResults: 100,
      }),
    );
    out.push(...(res.Users ?? []));
    nextToken = res.NextToken;
  } while (nextToken);
  return out;
}

function printUserTable(users: User[]) {
  console.log("─".repeat(120));
  console.log(
    "UserId".padEnd(38) +
      "  " +
      "UserName".padEnd(20) +
      "  " +
      "Email".padEnd(35) +
      "  " +
      "이름",
  );
  console.log("─".repeat(120));
  for (const u of users) {
    const email = u.Emails?.[0]?.Value ?? "-";
    const userName = u.UserName ?? "-";
    const given = u.Name?.GivenName ?? "";
    const family = u.Name?.FamilyName ?? "";
    const fullName = `${family}${given}` || u.DisplayName || "-";
    console.log(
      (u.UserId ?? "?").padEnd(38) +
        "  " +
        userName.padEnd(20) +
        "  " +
        email.padEnd(35) +
        "  " +
        fullName,
    );
  }
  console.log("─".repeat(120));
}

async function main() {
  console.log(
    `[check-id] IAM=${process.env.AWS_ACCESS_KEY_ID?.slice(0, 8)}..., ${CANDIDATE_REGIONS.length}개 리전 스캔 중`,
  );

  const instances = await findInstances();
  if (instances.length === 0) {
    console.error("[check-id] ❌ 모든 리전에서 Identity Center 인스턴스 못 찾음");
    console.error("  → 권한 부족 또는 인스턴스 없음");
    printNeededPolicy();
    process.exit(1);
  }

  console.log(`\n[check-id] ✓ ${instances.length}개 인스턴스 발견:\n`);
  for (const inst of instances) {
    console.log(
      `  region=${inst.region.padEnd(15)} name=${(inst.name ?? "-").padEnd(20)} store=${inst.identityStoreId}`,
    );
  }

  // 각 인스턴스 별 사용자 목록 출력
  for (const inst of instances) {
    console.log("\n" + "═".repeat(120));
    console.log(`📍 ${inst.name ?? "(unnamed)"} — region: ${inst.region} — store: ${inst.identityStoreId}`);
    console.log("═".repeat(120));
    try {
      const users = await listUsers(inst.identityStoreId, inst.region);
      console.log(`사용자 ${users.length}명\n`);
      if (users.length > 0) printUserTable(users);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.error(`  ❌ ListUsers 실패: ${e.name} - ${e.message}`);
    }
  }

  console.log("\n→ Kiro CSV 의 user_id 와 일치하는 인스턴스를 사용하면 됩니다.");
}

function printNeededPolicy() {
  console.error("");
  console.error("─".repeat(70));
  console.error("우리 IAM 사용자에게 다음 inline policy 추가:");
  console.error("─".repeat(70));
  console.error(
    JSON.stringify(
      {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "sso:ListInstances",
              "identitystore:ListUsers",
              "identitystore:DescribeUser",
              "identitystore:ListGroups",
              "identitystore:ListGroupMemberships",
            ],
            Resource: "*",
          },
        ],
      },
      null,
      2,
    ),
  );
  console.error("─".repeat(70));
}

main().catch((err) => {
  console.error("[check-id] 예기치 못한 실패:", err);
  process.exit(1);
});
