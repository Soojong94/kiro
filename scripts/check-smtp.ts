// SMTP 자격증명/연결 검증용 1회성 스크립트.
// .env.local 의 SMTP_* 값으로 Gmail 서버 핸드셰이크만 시도 (실제 메일 발송 X).
//
// 실행: npm run check-smtp

import { verifyTransport } from "@/lib/email";

async function main() {
  console.log(
    `[check-smtp] 연결 시도: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} (user=${process.env.SMTP_USER})`,
  );
  await verifyTransport();
  console.log("[check-smtp] ✅ SMTP 연결 및 인증 성공");
}

main().catch((err) => {
  console.error("[check-smtp] ❌ 실패:", err.message);
  console.error("  → Gmail 앱 비밀번호 / 2FA 활성화 / SMTP_USER 주소 확인");
  process.exit(1);
});
