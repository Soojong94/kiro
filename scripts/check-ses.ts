// AWS SES 자격증명/권한/region 검증용 1회성 스크립트.
// GetSendQuota 호출만 — 실제 메일 발송 X.
//
// 실행: npm run check-ses

import { verifyTransport } from "@/lib/email";

async function main() {
  const region = process.env.SES_REGION ?? process.env.AWS_REGION ?? "us-east-1";
  console.log(`[check-ses] region=${region} 자격증명 + SES 권한 확인 중...`);
  await verifyTransport();
  console.log("[check-ses] ✅ SES 연결 성공 (GetSendQuota 통과)");
  console.log("  → 실제 발송은 별도. 샌드박스 상태면 verified 주소끼리만 가능.");
}

main().catch((err) => {
  console.error("[check-ses] ❌ 실패:", err.message);
  console.error("  → IAM Role 정책에 ses:SendEmail / ses:SendRawEmail 가 있는지 확인");
  console.error("  → SES region 확인 (현재 SES 셋업은 us-east-1)");
  process.exit(1);
});
