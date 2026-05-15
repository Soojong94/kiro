// 첫 CSV가 떨어지기 전까지 쓸 목업 데이터.
// CSV 적재가 시작되면 이 모듈은 lib/db.ts 의 PG 쿼리로 교체된다.

import type { DailyUsage, School, Student } from "./types";

const SCHOOLS: School[] = [
  { id: "snu", name: "서울대학교", kind: "university" },
  { id: "kaist", name: "KAIST", kind: "university" },
  { id: "postech", name: "포항공과대학교", kind: "university" },
  { id: "minjok", name: "민족사관고등학교", kind: "high_school" },
  { id: "daewon", name: "대원외국어고등학교", kind: "high_school" },
];

// 학교별 학생 명단 (실명은 mock — 실제로는 CSV 도착 후 admin이 매핑).
// 학교당 20명 × 5학교 = 100명.
const STUDENTS_BY_SCHOOL: Record<string, string[]> = {
  snu: [
    "김민준", "이서연", "박지호", "최예준", "정수아", "남궁민준", "선우하늘",
    "김지우", "이도현", "박서아", "최하준", "정유진", "강민서", "윤채영",
    "장준호", "한예진", "문서윤", "오현우", "신지민", "권태양",
  ],
  kaist: [
    "조하은", "강도윤", "윤시우", "장하린", "임채원", "한지민", "김재훈",
    "이하늘", "박세빈", "최도윤", "정윤서", "강수아", "윤하경", "장태리",
    "한승민", "문지환", "오시현", "신주원", "권유나", "송재이",
  ],
  postech: [
    "오서윤", "서지안", "신유나", "권민서", "김건우", "이채민", "박시원",
    "최지안", "정하늘", "강서준", "윤가람", "장은우", "한수빈", "문예나",
    "오지호", "김수현", "이지율", "박하람", "김하은", "정태연",
  ],
  minjok: [
    "황도현", "안하준", "송예린", "전유준", "김주안", "이태민", "박하윤",
    "최은서", "정시아", "강지율", "윤서윤", "장지안", "한도윤", "문하늘",
    "오지환", "백승호", "남효주", "독고진", "사공유리", "제갈현우",
  ],
  daewon: [
    "홍시아", "백지윤", "고예원", "문지후", "김도하", "이서영", "박민채",
    "최예린", "정한울", "강은우", "윤지유", "장재희", "한채아", "문나래",
    "오태경", "유시현", "추다온", "변하영", "노아윤", "구본혁",
  ],
};

const MODELS = ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"];

// 결정론적 PRNG (mulberry32)
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeUserId(idx: number): string {
  return `00000000-0000-4000-8000-${String(idx).padStart(12, "0")}`;
}

export function getMockSchools(): School[] {
  return SCHOOLS;
}

export function getMockStudents(): Student[] {
  const out: Student[] = [];
  let i = 1;
  for (const school of SCHOOLS) {
    const names = STUDENTS_BY_SCHOOL[school.id] ?? [];
    for (const name of names) {
      out.push({
        userId: makeUserId(i++),
        schoolId: school.id,
        realName: name,
        cohort: school.kind === "university" ? "2026 학부생" : "2026-1학년",
      });
    }
  }
  return out;
}

export function getMockDailyUsage(daysBack = 30, today = new Date()): DailyUsage[] {
  const students = getMockStudents();
  const rows: DailyUsage[] = [];
  const rng = makeRng(42);

  for (let d = 1; d <= daysBack; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - d);
    const dateStr = dt.toISOString().slice(0, 10);

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const intensity = ((i * 137) % 100) / 100;
      const attended = rng() < 0.35 + intensity * 0.55;
      if (!attended) continue;

      const messages = Math.floor(5 + rng() * 40 * (0.4 + intensity));
      const credits = Math.round(messages * (0.6 + rng() * 1.8) * 10) / 10;
      const conversations = Math.max(1, Math.floor(messages / (4 + rng() * 6)));
      const overage = rng() < 0.05 ? Math.round(credits * 0.2 * 10) / 10 : 0;

      const m: Record<string, number> = {};
      let remaining = messages;
      for (let j = 0; j < MODELS.length; j++) {
        const isLast = j === MODELS.length - 1;
        const portion = isLast ? remaining : Math.floor(remaining * rng());
        m[MODELS[j]] = portion;
        remaining -= portion;
      }

      rows.push({
        date: dateStr,
        schoolId: s.schoolId,
        userId: s.userId,
        clientType: rng() < 0.85 ? "KIRO_IDE" : "KIRO_CLI",
        subscriptionTier: "Pro",
        totalMessages: messages,
        chatConversations: conversations,
        creditsUsed: credits,
        overageCreditsUsed: overage,
        modelMessages: m,
      });
    }
  }

  return rows;
}
