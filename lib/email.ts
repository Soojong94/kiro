// SMTP 발송 — 학생 계정 복구 메일 등. Gmail App Password 사용.
// 프로덕션은 SES 등으로 교체 가능 — sendMail() 호출부는 그대로.

import nodemailer, { type Transporter } from "nodemailer";

let _transport: Transporter | null = null;

function getTransport(): Transporter {
  if (_transport) return _transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP_HOST / SMTP_USER / SMTP_PASS 가 .env.local 에 설정되어야 합니다.",
    );
  }
  _transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465=SMTPS, 587=STARTTLS
    auth: { user, pass },
  });
  return _transport;
}

const FROM = process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? "noreply@example.com";

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const t = getTransport();
  await t.sendMail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

// SMTP 연결 확인용 (스크립트에서 사용).
export async function verifyTransport(): Promise<void> {
  await getTransport().verify();
}
