// 학생 계정 복구 — 아이디 찾기 + 비번 재설정 토큰.
// 보안 원칙: 이메일 존재 여부를 응답으로 노출하지 않음 (열거 공격 방지).

import { randomBytes } from "node:crypto";
import { hashPassword } from "./auth";
import { pool } from "./db";
import { sendMail } from "./email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1시간

function genToken(): string {
  // 32 bytes → 43 chars base64url, URL-safe.
  return randomBytes(32).toString("base64url");
}

function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

// ─── 아이디 찾기 ──────────────────────────────────────────────────
// 이메일로 학생 조회 → 있으면 아이디 메일 발송. 없으면 조용히 무시.
// 호출부는 항상 "메일 발송됐다고 가정" 메시지만 노출.
export async function requestUsernameRecovery(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const { rows } = await pool.query<{
    username: string;
    real_name: string;
  }>(
    `SELECT username, real_name FROM students
      WHERE lower(email) = $1 AND username IS NOT NULL
      LIMIT 1`,
    [normalized],
  );
  const found = rows[0];
  if (!found) return; // 조용히 종료 — 존재 여부 노출 금지

  await sendMail({
    to: email,
    subject: "[Kiro 통합 랭킹] 아이디 안내",
    text: usernameRecoveryText(found.real_name, found.username),
    html: usernameRecoveryHtml(found.real_name, found.username),
  });
}

// ─── 비밀번호 재설정 토큰 발급 ────────────────────────────────────
// 이메일로 학생 조회 → 있으면 토큰 생성 + 재설정 링크 메일.
// 24시간 안에 같은 학생에 대해 너무 많이 발급되면 차단 (간이 rate limit).
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const { rows } = await pool.query<{
    school_id: string;
    user_id: string;
    real_name: string;
  }>(
    `SELECT school_id, user_id, real_name FROM students
      WHERE lower(email) = $1 AND username IS NOT NULL
      LIMIT 1`,
    [normalized],
  );
  const found = rows[0];
  if (!found) return;

  // rate limit: 같은 학생이 1시간 안에 5건 이상이면 차단
  const { rows: cnt } = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM password_reset_tokens
      WHERE student_school_id = $1 AND student_user_id = $2
        AND created_at > now() - INTERVAL '1 hour'`,
    [found.school_id, found.user_id],
  );
  if (Number(cnt[0].c) >= 5) return;

  const token = genToken();
  const expires = new Date(Date.now() + TOKEN_TTL_MS);
  await pool.query(
    `INSERT INTO password_reset_tokens
       (token, student_school_id, student_user_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, found.school_id, found.user_id, expires.toISOString()],
  );

  const link = `${appBaseUrl()}/login/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "[Kiro 통합 랭킹] 비밀번호 재설정 안내",
    text: passwordResetText(found.real_name, link),
    html: passwordResetHtml(found.real_name, link),
  });
}

// ─── 토큰으로 비밀번호 실제 변경 ──────────────────────────────────
export interface ResetResult {
  ok: boolean;
  reason?: "not_found" | "expired" | "used";
}

export async function consumeResetToken(
  token: string,
  newPassword: string,
): Promise<ResetResult> {
  const { rows } = await pool.query<{
    student_school_id: string;
    student_user_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT student_school_id, student_user_id, expires_at, used_at
       FROM password_reset_tokens WHERE token = $1`,
    [token],
  );
  const t = rows[0];
  if (!t) return { ok: false, reason: "not_found" };
  if (t.used_at) return { ok: false, reason: "used" };
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const hash = await hashPassword(newPassword);

  // 트랜잭션: 비번 변경 + 토큰 소진 (재사용 방지)
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE students
          SET password_hash = $1, must_change_password = false
        WHERE school_id = $2 AND user_id = $3`,
      [hash, t.student_school_id, t.student_user_id],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now() WHERE token = $1`,
      [token],
    );
    // 같은 학생의 다른 미사용 토큰도 모두 무효화 (보안)
    await client.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE student_school_id = $1 AND student_user_id = $2
          AND used_at IS NULL AND token <> $3`,
      [t.student_school_id, t.student_user_id, token],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { ok: true };
}

// ─── 이메일 본문 ──────────────────────────────────────────────────
function usernameRecoveryText(realName: string, username: string): string {
  return `안녕하세요 ${realName}님,

Kiro 통합 랭킹 계정 아이디 안내 요청을 받았습니다.

  아이디: ${username}

본인이 요청하지 않았다면 이 메일을 무시하세요.`;
}

function usernameRecoveryHtml(realName: string, username: string): string {
  return baseHtml(`
    <p>안녕하세요 <strong>${escapeHtml(realName)}</strong>님,</p>
    <p>Kiro 통합 랭킹 계정 아이디 안내 요청을 받았습니다.</p>
    <div style="margin:20px 0;padding:16px;background:#f2f8fd;border:1px solid #d5dbdb;border-radius:8px;">
      <div style="font-size:11px;color:#5f6b7a;font-weight:600;letter-spacing:0.5px;">아이디</div>
      <div style="font-size:18px;color:#16191f;font-weight:700;margin-top:4px;font-family:monospace;">
        ${escapeHtml(username)}
      </div>
    </div>
    <p style="font-size:12px;color:#5f6b7a;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
  `);
}

function passwordResetText(realName: string, link: string): string {
  return `안녕하세요 ${realName}님,

Kiro 통합 랭킹 비밀번호 재설정 요청을 받았습니다.
아래 링크를 클릭해서 새 비밀번호를 설정해주세요 (1시간 유효).

  ${link}

본인이 요청하지 않았다면 이 메일을 무시하세요.`;
}

function passwordResetHtml(realName: string, link: string): string {
  return baseHtml(`
    <p>안녕하세요 <strong>${escapeHtml(realName)}</strong>님,</p>
    <p>Kiro 통합 랭킹 비밀번호 재설정 요청을 받았습니다.<br/>
       아래 버튼을 눌러 새 비밀번호를 설정해주세요. <strong>링크는 1시간 동안 유효</strong>합니다.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${escapeHtml(link)}"
         style="display:inline-block;background:#0972d3;color:#fff;text-decoration:none;
                padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">
        비밀번호 재설정
      </a>
    </p>
    <p style="font-size:12px;color:#5f6b7a;">버튼이 동작하지 않으면 아래 주소를 브라우저에 직접 붙여넣어 주세요:<br/>
      <span style="word-break:break-all;color:#0972d3;">${escapeHtml(link)}</span></p>
    <p style="font-size:12px;color:#5f6b7a;">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>
  `);
}

function baseHtml(inner: string): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#16191f;line-height:1.55;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #eaeded;border-radius:12px;padding:32px;">
    <div style="font-size:13px;color:#5f6b7a;letter-spacing:1px;font-weight:700;margin-bottom:8px;">KIRO 통합 랭킹</div>
    ${inner}
    <hr style="border:none;border-top:1px solid #eaeded;margin:24px 0;" />
    <div style="font-size:11px;color:#95a5b8;">이 메일은 자동 발송되었습니다 · powered by AWS Kiro</div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
