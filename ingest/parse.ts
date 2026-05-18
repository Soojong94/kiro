// Kiro user activity report CSV → 구조화된 행으로 파싱.
// CSV 컬럼: UserId, ClientType, Subscription_Tier, Total_Messages,
//           Chat_Conversations, Credits_Used, Overage_Credits_Used,
//           + 동적 모델 컬럼 (claude-opus-4-7 등)
// 날짜는 CSV에 없음 — S3 경로에서 호출자가 주입.

import { parse } from "csv-parse";
import { Readable } from "node:stream";

// CSV의 정적(고정) 컬럼. 그 외 컬럼은 모델명으로 취급.
const STATIC_COLS = new Set([
  "UserId",
  "ClientType",
  "Subscription_Tier",
  "Total_Messages",
  "Chat_Conversations",
  "Credits_Used",
  "Overage_Credits_Used",
]);

export interface ParsedRow {
  userId: string;
  clientType: string;
  subscriptionTier: string;
  totalMessages: number;
  chatConversations: number;
  creditsUsed: number;
  overageCreditsUsed: number;
  modelMessages: Record<string, number>;
}

export async function parseCsv(buffer: Buffer): Promise<ParsedRow[]> {
  const rows: ParsedRow[] = [];

  await new Promise<void>((resolve, reject) => {
    Readable.from(buffer)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (rec: Record<string, string>) => {
        const modelMessages: Record<string, number> = {};
        for (const [k, v] of Object.entries(rec)) {
          if (!STATIC_COLS.has(k) && v) {
            const n = Number(v);
            if (n > 0) modelMessages[k] = n;
          }
        }
        rows.push({
          userId: rec["UserId"] ?? "",
          clientType: rec["ClientType"] ?? "",
          subscriptionTier: rec["Subscription_Tier"] ?? "",
          totalMessages: Number(rec["Total_Messages"]) || 0,
          chatConversations: Number(rec["Chat_Conversations"]) || 0,
          creditsUsed: Number(rec["Credits_Used"]) || 0,
          overageCreditsUsed: Number(rec["Overage_Credits_Used"]) || 0,
          modelMessages,
        });
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return rows;
}
