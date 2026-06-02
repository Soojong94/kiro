// AWS SES 발송 — 학생 비번 재설정, 운영 cron 알림 등.
// EC2 instance profile (운영) 또는 AWS_ACCESS_KEY_ID/SECRET (로컬 개발) 자격증명 사용.
// SES region 은 SES_REGION 우선, 없으면 AWS_REGION, 그것도 없으면 us-east-1.

import {
  SESClient,
  SendEmailCommand,
  GetSendQuotaCommand,
} from "@aws-sdk/client-ses";

const REGION =
  process.env.SES_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const FROM =
  process.env.EMAIL_FROM ?? "Kiro 통합 랭킹 <noreply@kiro.tbit.co.kr>";

let _client: SESClient | null = null;

function getClient(): SESClient {
  if (_client) return _client;
  _client = new SESClient({ region: REGION });
  return _client;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  // dev 모드 (SES_REGION 미설정 = 로컬) — 콘솔에 본문 출력하고 SES 안 부름.
  // 운영 .env 엔 SES_REGION=us-east-1 이라 자연스럽게 운영만 SES 호출.
  // 토큰 URL 은 text 본문에 포함되어 있으니 콘솔에서 복사해 다음 단계 테스트.
  if (!process.env.SES_REGION) {
    console.log("\n━━━━━━━━━━ [DEV MAIL] (SES_REGION 미설정 → SES 호출 skip) ━━━━━━━━━━");
    console.log(`To:      ${opts.to}`);
    console.log(`Subject: ${opts.subject}`);
    console.log("───────────────────────────────────────────────────");
    console.log(opts.text);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    return;
  }
  const client = getClient();
  await client.send(
    new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [opts.to] },
      Message: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: opts.html, Charset: "UTF-8" },
          Text: { Data: opts.text, Charset: "UTF-8" },
        },
      },
    }),
  );
}

// SES 권한 + 자격증명 확인 (스크립트에서 사용).
// GetSendQuota 는 권한 적게 들고 dry-run 성격이라 진단에 적합.
export async function verifyTransport(): Promise<void> {
  const client = getClient();
  await client.send(new GetSendQuotaCommand({}));
}
