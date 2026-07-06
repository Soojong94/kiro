import { pool } from "./db";

export type ReportPeriodPreset = "this_month" | "last_month" | "7d" | "custom";

export interface ReportWindow {
  from: string;
  to: string;
}

export interface ReportSchoolOption {
  id: string;
  name: string;
  isInternal: boolean;
}

export interface SchoolReportSummary {
  schoolId: string;
  schoolName: string;
  isInternal: boolean;
  registeredStudents: number;
  activeStudents: number;
  activeRate: number;
  activeDays: number;
  totalMessages: number;
  totalConversations: number;
  totalCredits: number;
  overageCredits: number;
  avgCreditsPerActiveStudent: number;
}

export interface DailyReportRow {
  date: string;
  activeStudents: number;
  totalMessages: number;
  totalConversations: number;
  totalCredits: number;
}

export interface BreakdownRow {
  label: string;
  value: number;
  share: number;
}

export interface StudentReportRow {
  userId: string;
  realName: string;
  totalCredits: number;
  activeDays: number;
  totalMessages: number;
}

export interface SchoolReportDetail {
  schoolId: string;
  schoolName: string;
  daily: DailyReportRow[];
  clients: BreakdownRow[];
  models: BreakdownRow[];
  topCredits: StudentReportRow[];
  topAttendance: StudentReportRow[];
}

export interface UsageReport {
  window: ReportWindow;
  schools: SchoolReportSummary[];
  detail: SchoolReportDetail | null;
}

export function reportWindow(
  preset: ReportPeriodPreset,
  today = new Date(),
  custom?: { from?: string; to?: string },
): ReportWindow {
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const to = yesterday.toISOString().slice(0, 10);

  if (preset === "custom" && custom?.from && custom?.to) {
    return custom.from <= custom.to
      ? { from: custom.from, to: custom.to }
      : { from: custom.to, to: custom.from };
  }

  if (preset === "7d") {
    const from = new Date(yesterday);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: from.toISOString().slice(0, 10), to };
  }

  if (preset === "last_month") {
    const y = yesterday.getUTCFullYear();
    const m = yesterday.getUTCMonth();
    const lastMonth = m === 0 ? 11 : m - 1;
    const year = m === 0 ? y - 1 : y;
    const lastDay = new Date(Date.UTC(year, lastMonth + 1, 0)).getUTCDate();
    return {
      from: `${year}-${String(lastMonth + 1).padStart(2, "0")}-01`,
      to: `${year}-${String(lastMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }

  const y = yesterday.getUTCFullYear();
  const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  return { from: `${y}-${m}-01`, to };
}

export async function loadReportSchoolOptions(opts: {
  includeInternal?: boolean;
  schoolId?: string | null;
}): Promise<ReportSchoolOption[]> {
  const conds: string[] = [];
  const params: unknown[] = [];

  if (!opts.includeInternal) {
    conds.push("is_internal = false");
  }
  if (opts.schoolId) {
    params.push(opts.schoolId);
    conds.push(`id = $${params.length}`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const { rows } = await pool.query<{
    id: string;
    name: string;
    is_internal: boolean;
  }>(
    `SELECT id, name, is_internal
       FROM schools
      ${where}
      ORDER BY is_internal, name`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isInternal: r.is_internal,
  }));
}

export async function loadUsageReport(opts: {
  from: string;
  to: string;
  schoolId?: string | null;
  includeInternal?: boolean;
}): Promise<UsageReport> {
  const params: unknown[] = [opts.from, opts.to];
  const schoolConds: string[] = [];
  const usageConds: string[] = ["du.date BETWEEN $1 AND $2"];
  const modelConds: string[] = ["mu.date BETWEEN $1 AND $2"];

  if (!opts.includeInternal) {
    schoolConds.push("s.is_internal = false");
  }
  if (opts.schoolId) {
    params.push(opts.schoolId);
    const p = `$${params.length}`;
    schoolConds.push(`s.id = ${p}`);
    usageConds.push(`du.school_id = ${p}`);
    modelConds.push(`mu.school_id = ${p}`);
  }

  const schoolWhere = schoolConds.length ? `WHERE ${schoolConds.join(" AND ")}` : "";
  const usageWhere = usageConds.join(" AND ");
  const modelWhere = modelConds.join(" AND ");

  const summaries = await loadSchoolSummaries(schoolWhere, usageWhere, params);
  const detail = opts.schoolId
    ? await loadSchoolDetail(opts.schoolId, usageWhere, modelWhere, params)
    : null;

  return {
    window: { from: opts.from, to: opts.to },
    schools: summaries,
    detail,
  };
}

async function loadSchoolSummaries(
  schoolWhere: string,
  usageWhere: string,
  params: unknown[],
): Promise<SchoolReportSummary[]> {
  const { rows } = await pool.query<{
    school_id: string;
    school_name: string;
    is_internal: boolean;
    registered_students: string;
    active_students: string;
    active_days: string;
    total_messages: string;
    total_conversations: string;
    total_credits: string;
    overage_credits: string;
  }>(
    `
    WITH selected_schools AS (
      SELECT s.id, s.name, s.is_internal
        FROM schools s
       ${schoolWhere}
    ),
    student_counts AS (
      SELECT school_id, count(*)::int AS registered_students
        FROM students
       GROUP BY school_id
    ),
    usage AS (
      SELECT
        du.school_id,
        count(DISTINCT du.user_id)::int AS active_students,
        count(DISTINCT du.date)::int AS active_days,
        coalesce(sum(du.total_messages), 0)::int AS total_messages,
        coalesce(sum(du.chat_conversations), 0)::int AS total_conversations,
        coalesce(sum(du.credits_used), 0)::float8 AS total_credits,
        coalesce(sum(du.overage_credits_used), 0)::float8 AS overage_credits
      FROM daily_usage du
      WHERE ${usageWhere}
      GROUP BY du.school_id
    )
    SELECT
      s.id AS school_id,
      s.name AS school_name,
      s.is_internal,
      coalesce(sc.registered_students, 0)::text AS registered_students,
      coalesce(u.active_students, 0)::text AS active_students,
      coalesce(u.active_days, 0)::text AS active_days,
      coalesce(u.total_messages, 0)::text AS total_messages,
      coalesce(u.total_conversations, 0)::text AS total_conversations,
      coalesce(u.total_credits, 0)::text AS total_credits,
      coalesce(u.overage_credits, 0)::text AS overage_credits
    FROM selected_schools s
    LEFT JOIN student_counts sc ON sc.school_id = s.id
    LEFT JOIN usage u ON u.school_id = s.id
    ORDER BY coalesce(u.total_credits, 0) DESC, s.name
    `,
    params,
  );

  return rows.map((r) => {
    const registeredStudents = Number(r.registered_students);
    const activeStudents = Number(r.active_students);
    const totalCredits = round1(Number(r.total_credits));

    return {
      schoolId: r.school_id,
      schoolName: r.school_name,
      isInternal: r.is_internal,
      registeredStudents,
      activeStudents,
      activeRate: registeredStudents > 0 ? round1((activeStudents / registeredStudents) * 100) : 0,
      activeDays: Number(r.active_days),
      totalMessages: Number(r.total_messages),
      totalConversations: Number(r.total_conversations),
      totalCredits,
      overageCredits: round1(Number(r.overage_credits)),
      avgCreditsPerActiveStudent:
        activeStudents > 0 ? round1(totalCredits / activeStudents) : 0,
    };
  });
}

async function loadSchoolDetail(
  schoolId: string,
  usageWhere: string,
  modelWhere: string,
  params: unknown[],
): Promise<SchoolReportDetail | null> {
  const [schoolRes, dailyRes, clientRes, modelRes, creditsRes, attendanceRes] =
    await Promise.all([
      pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM schools WHERE id = $1`,
        [schoolId],
      ),
      pool.query<{
        date: string;
        active_students: string;
        total_messages: string;
        total_conversations: string;
        total_credits: string;
      }>(
        `
        SELECT
          du.date::text AS date,
          count(DISTINCT du.user_id)::text AS active_students,
          coalesce(sum(du.total_messages), 0)::text AS total_messages,
          coalesce(sum(du.chat_conversations), 0)::text AS total_conversations,
          coalesce(sum(du.credits_used), 0)::text AS total_credits
        FROM daily_usage du
        WHERE ${usageWhere}
        GROUP BY du.date
        ORDER BY du.date
        `,
        params,
      ),
      pool.query<{ label: string; value: string }>(
        `
        SELECT du.client_type AS label, coalesce(sum(du.credits_used), 0)::text AS value
        FROM daily_usage du
        WHERE ${usageWhere}
        GROUP BY du.client_type
        ORDER BY coalesce(sum(du.credits_used), 0) DESC
        `,
        params,
      ),
      pool.query<{ label: string; value: string }>(
        `
        SELECT mu.model_name AS label, coalesce(sum(mu.messages), 0)::text AS value
        FROM model_usage mu
        WHERE ${modelWhere}
        GROUP BY mu.model_name
        ORDER BY coalesce(sum(mu.messages), 0) DESC
        LIMIT 12
        `,
        params,
      ),
      pool.query<{
        user_id: string;
        real_name: string | null;
        total_credits: string;
        active_days: string;
        total_messages: string;
      }>(
        `
        SELECT
          du.user_id,
          max(st.real_name) AS real_name,
          coalesce(sum(du.credits_used), 0)::text AS total_credits,
          count(DISTINCT CASE WHEN du.total_messages > 0 THEN du.date END)::text AS active_days,
          coalesce(sum(du.total_messages), 0)::text AS total_messages
        FROM daily_usage du
        LEFT JOIN students st ON st.school_id = du.school_id AND st.user_id = du.user_id
        WHERE ${usageWhere}
        GROUP BY du.user_id
        ORDER BY coalesce(sum(du.credits_used), 0) DESC
        LIMIT 10
        `,
        params,
      ),
      pool.query<{
        user_id: string;
        real_name: string | null;
        total_credits: string;
        active_days: string;
        total_messages: string;
      }>(
        `
        SELECT
          du.user_id,
          max(st.real_name) AS real_name,
          coalesce(sum(du.credits_used), 0)::text AS total_credits,
          count(DISTINCT CASE WHEN du.total_messages > 0 THEN du.date END)::text AS active_days,
          coalesce(sum(du.total_messages), 0)::text AS total_messages
        FROM daily_usage du
        LEFT JOIN students st ON st.school_id = du.school_id AND st.user_id = du.user_id
        WHERE ${usageWhere}
        GROUP BY du.user_id
        ORDER BY count(DISTINCT CASE WHEN du.total_messages > 0 THEN du.date END) DESC,
                 coalesce(sum(du.credits_used), 0) DESC
        LIMIT 10
        `,
        params,
      ),
    ]);

  const school = schoolRes.rows[0];
  if (!school) return null;

  return {
    schoolId: school.id,
    schoolName: school.name,
    daily: dailyRes.rows.map((r) => ({
      date: r.date,
      activeStudents: Number(r.active_students),
      totalMessages: Number(r.total_messages),
      totalConversations: Number(r.total_conversations),
      totalCredits: round1(Number(r.total_credits)),
    })),
    clients: toBreakdown(clientRes.rows),
    models: toBreakdown(modelRes.rows),
    topCredits: creditsRes.rows.map(toStudentRow),
    topAttendance: attendanceRes.rows.map(toStudentRow),
  };
}

function toBreakdown(rows: { label: string; value: string }[]): BreakdownRow[] {
  const total = rows.reduce((sum, r) => sum + Number(r.value), 0);
  return rows.map((r) => {
    const value = round1(Number(r.value));
    return {
      label: r.label,
      value,
      share: total > 0 ? round1((Number(r.value) / total) * 100) : 0,
    };
  });
}

function toStudentRow(row: {
  user_id: string;
  real_name: string | null;
  total_credits: string;
  active_days: string;
  total_messages: string;
}): StudentReportRow {
  return {
    userId: row.user_id,
    realName: row.real_name ?? "미등록",
    totalCredits: round1(Number(row.total_credits)),
    activeDays: Number(row.active_days),
    totalMessages: Number(row.total_messages),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
