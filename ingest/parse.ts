// Kiro user activity report CSV → 구조화된 행으로 파싱.
// 실제 CSV 컬럼 (2026-05 기준):
//   Date, UserId, Client_Type, Chat_Conversations, Credits_Used,
//   Overage_Cap, Overage_Credits_Used, Overage_Enabled, ProfileId,
//   Subscription_Tier, Total_Messages, New_User,
//   + 동적 모델 컬럼 (auto_messages, claude_sonnet_4.6_messages 등)
//
// 동적 컬럼은 '_messages' 접미사 제거해서 modelMessages 키로 사용.

import { parse } from "csv-parse";
import { Readable } from "node:stream";

// CSV 의 정적(고정) 컬럼. 그 외 컬럼은 모델명으로 취급 (단 *_messages 끝나는 것만).
const STATIC_COLS = new Set([
  "Date",
  "UserId",
  "Client_Type",
  "Chat_Conversations",
  "Credits_Used",
  "Overage_Cap",
  "Overage_Credits_Used",
  "Overage_Enabled",
  "ProfileId",
  "Subscription_Tier",
  "Total_Messages",
  "New_User",
]);

export interface ParsedRow {
  date: string | null;        // CSV 의 Date 컬럼. 없으면 호출자가 S3 경로에서 주입.
  userId: string;
  clientType: string;          // KIRO_WEB / KIRO_IDE / KIRO_CLI / PLUGIN 등
  subscriptionTier: string;    // PRO_PLUS / PRO / POWER / FREE 등
  totalMessages: number;
  chatConversations: number;
  creditsUsed: number;
  overageCap: number;
  overageCreditsUsed: number;
  overageEnabled: boolean;
  profileId: string;
  newUser: boolean;
  // 모델별 메시지 — 키는 '_messages' 접미사 떼어낸 이름.
  // ex) 'auto_messages' → 'auto', 'claude_sonnet_4.6_messages' → 'claude_sonnet_4.6'
  modelMessages: Record<string, number>;
}

function asBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function parseCsv(buffer: Buffer): Promise<ParsedRow[]> {
  const rows: ParsedRow[] = [];

  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true, bom: true }))
      .on("data", (rec: Record<string, string>) => {
        const modelMessages: Record<string, number> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (STATIC_COLS.has(k)) continue;
          // 모델 컬럼은 '_messages' 로 끝남
          if (!k.endsWith("_messages")) continue;
          if (!v) continue;
          const n = Number(v);
          if (n > 0) {
            const name = k.slice(0, -"_messages".length);
            modelMessages[name] = n;
          }
        }
        rows.push({
          date: rec["Date"] || null,
          userId: rec["UserId"] ?? "",
          clientType: rec["Client_Type"] ?? "",
          subscriptionTier: rec["Subscription_Tier"] ?? "",
          totalMessages: Number(rec["Total_Messages"]) || 0,
          chatConversations: Number(rec["Chat_Conversations"]) || 0,
          creditsUsed: Number(rec["Credits_Used"]) || 0,
          overageCap: Number(rec["Overage_Cap"]) || 0,
          overageCreditsUsed: Number(rec["Overage_Credits_Used"]) || 0,
          overageEnabled: asBool(rec["Overage_Enabled"]),
          profileId: rec["ProfileId"] ?? "",
          newUser: asBool(rec["New_User"]),
          modelMessages,
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return rows;
}
