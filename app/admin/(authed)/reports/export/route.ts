import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  loadReportSchoolOptions,
  loadUsageReport,
  reportWindow,
  type ReportPeriodPreset,
} from "@/lib/report";

const PERIODS: ReportPeriodPreset[] = ["this_month", "7d", "last_month", "custom"];

function pickPreset(value: string | null): ReportPeriodPreset {
  return value && (PERIODS as string[]).includes(value)
    ? (value as ReportPeriodPreset)
    : "this_month";
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function fmtNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  const sp = request.nextUrl.searchParams;
  const requestedPreset = pickPreset(sp.get("period"));
  const fromParam = sp.get("from") ?? "";
  const toParam = sp.get("to") ?? "";
  const presetWindow = reportWindow(requestedPreset, new Date());
  const hasCustomDates =
    !!fromParam &&
    !!toParam &&
    (fromParam !== presetWindow.from || toParam !== presetWindow.to);
  const preset =
    requestedPreset === "custom" || hasCustomDates ? "custom" : requestedPreset;
  const window = reportWindow(preset, new Date(), {
    from: fromParam,
    to: toParam,
  });

  const selectedSchoolParam = sp.get("school") ?? "";
  const schools = await loadReportSchoolOptions({
    includeInternal: admin.role === "super",
    schoolId: admin.role === "school" ? admin.schoolId : null,
  });
  const selectedSchoolId =
    admin.role === "school"
      ? admin.schoolId
      : schools.some((s) => s.id === selectedSchoolParam)
        ? selectedSchoolParam
        : "";

  const report = await loadUsageReport({
    from: window.from,
    to: window.to,
    schoolId: selectedSchoolId || null,
    includeInternal: admin.role === "super",
  });

  const lines: string[] = [];
  lines.push(csvRow(["Kiro 사용 보고서"]));
  lines.push(csvRow(["기간", report.window.from, report.window.to]));
  lines.push(csvRow(["학교", report.detail?.schoolName ?? "전체 학교"]));
  lines.push("");

  lines.push(csvRow(["학교별 요약"]));
  lines.push(
    csvRow([
      "학교",
      "등록 학생",
      "활성 학생",
      "활성률(%)",
      "활성 일수",
      "총 메시지",
      "총 대화",
      "총 크레딧",
      "초과 크레딧",
      "활성 학생 1인 평균 크레딧",
    ]),
  );
  for (const row of report.schools) {
    lines.push(
      csvRow([
        row.schoolName,
        row.registeredStudents,
        row.activeStudents,
        row.activeRate,
        row.activeDays,
        row.totalMessages,
        row.totalConversations,
        fmtNumber(row.totalCredits),
        fmtNumber(row.overageCredits),
        fmtNumber(row.avgCreditsPerActiveStudent),
      ]),
    );
  }

  if (report.detail) {
    lines.push("");
    lines.push(csvRow(["일자별 사용량 추이"]));
    lines.push(csvRow(["날짜", "활성 학생", "메시지", "대화", "크레딧"]));
    for (const row of report.detail.daily) {
      lines.push(
        csvRow([
          row.date,
          row.activeStudents,
          row.totalMessages,
          row.totalConversations,
          fmtNumber(row.totalCredits),
        ]),
      );
    }

    lines.push("");
    lines.push(csvRow(["클라이언트별 크레딧"]));
    lines.push(csvRow(["클라이언트", "크레딧", "비중(%)"]));
    for (const row of report.detail.clients) {
      lines.push(csvRow([row.label, fmtNumber(row.value), row.share]));
    }

    lines.push("");
    lines.push(csvRow(["모델별 메시지"]));
    lines.push(csvRow(["모델", "메시지", "비중(%)"]));
    for (const row of report.detail.models) {
      lines.push(csvRow([row.label, fmtNumber(row.value), row.share]));
    }

    lines.push("");
    lines.push(csvRow(["크레딧 상위 학생"]));
    lines.push(csvRow(["학생", "크레딧", "출석일", "메시지"]));
    for (const row of report.detail.topCredits) {
      lines.push(
        csvRow([
          row.maskedName,
          fmtNumber(row.totalCredits),
          row.activeDays,
          row.totalMessages,
        ]),
      );
    }

    lines.push("");
    lines.push(csvRow(["출석일 상위 학생"]));
    lines.push(csvRow(["학생", "출석일", "크레딧", "메시지"]));
    for (const row of report.detail.topAttendance) {
      lines.push(
        csvRow([
          row.maskedName,
          row.activeDays,
          fmtNumber(row.totalCredits),
          row.totalMessages,
        ]),
      );
    }
  }

  const suffix = selectedSchoolId || "all";
  const filename = `kiro-report-${suffix}-${report.window.from}-${report.window.to}.csv`;
  const body = `\uFEFF${lines.join("\r\n")}`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
