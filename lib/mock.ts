// 첫 CSV가 떨어지기 전까지 쓸 목업 데이터.
// CSV 적재가 시작되면 이 모듈은 lib/db.ts 의 PG 쿼리로 교체된다.

import type { DailyUsage, School, Student } from "./types";

// 20개 mock 학교 — 필터/검색 UX 테스트용 규모.
const SCHOOLS: School[] = [
  { id: "snu",       name: "서울대학교",        kind: "university"  },
  { id: "kaist",     name: "KAIST",              kind: "university"  },
  { id: "postech",   name: "포항공과대학교",    kind: "university"  },
  { id: "yonsei",    name: "연세대학교",        kind: "university"  },
  { id: "korea",     name: "고려대학교",        kind: "university"  },
  { id: "hanyang",   name: "한양대학교",        kind: "university"  },
  { id: "sungkyun",  name: "성균관대학교",      kind: "university"  },
  { id: "sogang",    name: "서강대학교",        kind: "university"  },
  { id: "chungang",  name: "중앙대학교",        kind: "university"  },
  { id: "kyunghee",  name: "경희대학교",        kind: "university"  },
  { id: "ewha",      name: "이화여자대학교",    kind: "university"  },
  { id: "unist",     name: "UNIST",              kind: "university"  },
  { id: "minjok",    name: "민족사관고등학교",  kind: "high_school" },
  { id: "daewon",    name: "대원외국어고",      kind: "high_school" },
  { id: "hafs",      name: "외대부고",          kind: "high_school" },
  { id: "hana",      name: "하나고등학교",      kind: "high_school" },
  { id: "sangsan",   name: "상산고등학교",      kind: "high_school" },
  { id: "dongbuk",   name: "동북권",            kind: "region"      },
  { id: "seonam",    name: "서남권",            kind: "region"      },
  { id: "joongbu",   name: "중부권",            kind: "region"      },
];

// 결정론적 한국 이름 생성기 — 성 풀 × 이름 풀 + 학교/순번 시드
const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "윤", "장", "한", "임",
  "오", "신", "권", "황", "안", "송", "전", "홍", "양", "조",
];
const GIVEN_NAMES = [
  "민준", "서연", "지호", "예준", "수아", "도현", "시우", "하준", "채원", "지민",
  "재훈", "하늘", "세빈", "도윤", "윤서", "수아", "하경", "태리", "승민", "지환",
  "시현", "주원", "유나", "재이", "서윤", "지안", "유나", "민서", "건우", "채민",
  "시원", "지안", "하늘", "서준", "가람", "은우", "수빈", "예나", "지호", "수현",
];

function pickDeterministic<T>(pool: T[], schoolIdx: number, slot: number, offset: number): T {
  // 결정론적 인덱스 (학교마다 다른 분포, 같은 학교 내에선 안정적)
  return pool[(schoolIdx * 31 + slot * 17 + offset * 7) % pool.length];
}

function generateStudentNames(schoolIdx: number, count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let attempt = 0;
  while (out.length < count && attempt < count * 5) {
    const surname = pickDeterministic(SURNAMES, schoolIdx, out.length, attempt);
    const given = pickDeterministic(GIVEN_NAMES, schoolIdx, out.length, attempt * 3);
    const name = surname + given;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
    attempt++;
  }
  return out;
}

// 학교당 10명. 학교 0번부터 순서대로 user_id 1~10, 11~20, ...
const STUDENTS_PER_SCHOOL = 10;
const STUDENTS_BY_SCHOOL: Record<string, string[]> = Object.fromEntries(
  SCHOOLS.map((s, idx) => [s.id, generateStudentNames(idx, STUDENTS_PER_SCHOOL)]),
);

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

// 학생 목록은 정적이므로 모듈 레벨 캐시.
let _students: Student[] | null = null;
// usage 는 daysBack 별로 캐시.
const _usageCache = new Map<number, DailyUsage[]>();

export function getMockStudents(): Student[] {
  if (_students) return _students;
  const out: Student[] = [];
  let i = 1;
  for (const school of SCHOOLS) {
    const names = STUDENTS_BY_SCHOOL[school.id] ?? [];
    for (const name of names) {
      out.push({
        userId: makeUserId(i++),
        schoolId: school.id,
        realName: name,
        cohort:
          school.kind === "university"
            ? "2026 학부생"
            : school.kind === "high_school"
              ? "2026-1학년"
              : "2026 참여자",
      });
    }
  }
  _students = out;
  return _students;
}

// today 인자는 mock 특성상 무시하고 daysBack 기준 고정 시드로 캐시.
export function getMockDailyUsage(daysBack = 30, _today = new Date()): DailyUsage[] {
  const cached = _usageCache.get(daysBack);
  if (cached) return cached;
  const students = getMockStudents();
  const rows: DailyUsage[] = [];
  const rng = makeRng(42);

  // 캐시용으로 오늘 날짜 고정 (2026-05-15). 실 데이터 연결 시 제거.
  const ref = new Date("2026-05-15");
  for (let d = 1; d <= daysBack; d++) {
    const dt = new Date(ref);
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

  _usageCache.set(daysBack, rows);
  return rows;
}
