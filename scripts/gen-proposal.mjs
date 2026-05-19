// 1회성 — Kiro 통합 랭킹 제안서용 2페이지 요약 .docx 생성.
// 실행: node scripts/gen-proposal.mjs

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { writeFileSync } from "node:fs";

const FONT = "Malgun Gothic";

function p(text, opts = {}) {
  const { size = 22, bold = false, color = "16191f", align, after = 100, before = 0 } = opts;
  return new Paragraph({
    alignment: align,
    spacing: { before, after },
    children: [new TextRun({ text, font: FONT, size, bold, color })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: "16191f" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: { bottom: { color: "ec7211", style: BorderStyle.SINGLE, size: 8 } },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: "16191f" })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 140, after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: "0972d3" })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, font: FONT, size: 20, color: "16191f" })],
  });
}

function cell(text, opts = {}) {
  const { bold = false, bg, width = 25 } = opts;
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: bg ? { fill: bg } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: 18, bold, color: bg ? "ffffff" : "16191f" })],
      }),
    ],
  });
}

function table(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { bold: true, bg: "232f3e", width: widths[i] })),
  });
  const dataRows = rows.map(
    (r) => new TableRow({ children: r.map((c, i) => cell(c, { width: widths[i] })) }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

const children = [
  h1("AWS Kiro 사용량 통합 랭킹 대시보드"),
  p(
    "회사가 학교/조직에 제공한 AWS Kiro 사용 현황을 학생 단위로 집계해 공정하고 가시적인 랭킹을 제공하는 웹 서비스. 학생들이 본인 위치를 즉시 확인하고, 운영자(TBT 및 각 학교 어드민)는 조직별 활용도와 학생별 활동을 한눈에 본다.",
    { align: AlignmentType.JUSTIFIED, after: 200 },
  ),

  h2("시스템 개요"),
  table(
    ["구분", "내용"],
    [
      ["기술 스택", "Next.js 16 (App Router) · TypeScript · React 19 · Tailwind v4 · PostgreSQL 16"],
      ["인프라", "AWS EC2 · Docker Compose · nginx 리버스 프록시 · Let's Encrypt SSL"],
      ["인증", "Argon2id 해시 + iron-session 쿠키 · 학생 / 어드민 분리 세션"],
      ["데이터 흐름", "S3 (Kiro CSV) → 인제스트(일 1회 cron) → daily_usage 누적 → 스냅샷 → 페이지"],
      ["보안", "RBAC(슈퍼/학교) · IP 기반 rate limit · 감사 로그 · HTTPS 강제"],
      ["배포", "단일 서버, Docker 이미지로 컨테이너화. systemd 무관."],
    ],
    [25, 75],
  ),

  h2("학생 대시보드 (공개 측)"),
  p(
    "목적 — 학생이 자신의 토큰 사용량/출석 순위를 본교 또는 전 조직 기준으로 확인하고 학습 의욕을 자극.",
    { after: 100 },
  ),
  h3("기능 명세"),
  table(
    ["기능", "설명"],
    [
      ["로그인 / 로그아웃", "어드민이 발급한 아이디·비번. 첫 로그인 시 비번 변경 강제."],
      ["아이디 / 비번 찾기", "이메일 입력 → Gmail SMTP 발송 (이메일 존재 노출 X). 비번은 1시간 유효 토큰 링크."],
      ["통합 랭킹", "본교 디폴트 + 드롭다운으로 전체 조직 전환. 메트릭: 토큰 사용량 / 출석. 기간: 어제/7일/이번달/지난달/직접 입력."],
      ["본인 순위 강조", "랭킹 1위 행 위에 '내 순위' 핀 카드 + 본인 행에 YOU 배지 + 블루 ring."],
      ["월별 챔피언", "지난 12개월 월별 1위 (이번 달 제외). 메트릭/조직별 필터."],
      ["개인정보 보호", "공개 응답에는 학생 실명 마스킹 ('김*준'). 어드민 페이지에서만 실명 노출."],
    ],
    [30, 70],
  ),

  h2("관리자 대시보드 (사내)"),
  p(
    "목적 — TBT 본사(슈퍼)와 각 학교 운영자(학교 어드민)가 자기 권한 범위 안에서 학생 계정 발급, 학교 정보 관리, 사용 현황 조회를 수행.",
    { after: 100 },
  ),
  h3("역할 구분 (RBAC)"),
  table(
    ["역할", "권한"],
    [
      ["슈퍼 어드민 (TBT)", "모든 조직 데이터 조회. 학교 추가/삭제. 어드민 계정 발급. 전체 학생 계정 관리."],
      ["학교 어드민", "본교 학생 계정 발급/재발급/제거. 본교 대시보드 조회. 학교/어드민 메뉴 노출 안 됨."],
    ],
    [25, 75],
  ),
  h3("기능 명세"),
  table(
    ["페이지", "기능"],
    [
      ["대시보드", "조직별 비교 막대 차트 (총 크레딧 / 활성 학생 / 총 메시지 / 1인당 평균). 기간·메트릭 토글. 학교 검색/구분 필터. 데이터 테이블."],
      ["학생 계정", "계정 발급 폼 (학교·실명·이메일·초기 비번). CSV 일괄 등록 (예시 템플릿 다운로드 → 엑셀에서 수정 → 업로드, 행별 결과). 비번 재발급 / 제거. 실명·아이디·이메일 검색 + 학교 필터."],
      ["학교 (슈퍼만)", "신규 학교 등록 (id·이름·구분·AWS 계정 ID·S3 버킷/prefix·리전·Role ARN). 학교 정보 편집. 위험 영역 강제 삭제 (학생/사용량 데이터 보호 정책 적용)."],
      ["관리자 (슈퍼만)", "어드민 추가 (슈퍼/학교 역할). 비번 재발급. 본인/마지막 슈퍼 삭제 차단. 역할·학교·검색 필터."],
      ["감사", "모든 계정 변경 액션 audit_log 자동 기록 (행위자·액션·타깃·시각)."],
    ],
    [25, 75],
  ),

  h2("데이터 보관 및 안전성"),
  bullet("daily_usage / model_usage / students / admins → INSERT/UPSERT 만 사용, 정기 삭제 없음. 영구 누적."),
  bullet("스냅샷 테이블 (랭킹/KPI/챔피언) → 매일 덮어쓰기 + 지난 달은 월초 1회 캐시 (재계산 부담 없음)."),
  bullet("학생 로그인 정보는 어드민 명시적 액션에만 영향. 학교 삭제 시 사용량 데이터 있으면 차단 (데이터 보호)."),
  bullet("페이지는 미리 계산된 스냅샷만 읽음 → 클라이언트 부담 최소화."),
  bullet("PostgreSQL named volume + 일일 pg_dump 백업 권장."),

  h2("다음 단계"),
  bullet("Kiro 첫 일일 CSV 수신 후 학교별 S3 매핑 검증 및 cron 등록 (매일 02:30 UTC)."),
  bullet("'/admin/discover' 페이지 — 인제스트 후 미매핑 Kiro UserId 옆에 실명·아이디 입력해 일괄 학생 계정 생성."),
  bullet("Cross-account S3 가이드 적용 — 학교가 자기 계정 S3 버킷에 우리 ARN 허용 또는 IAM Role + STS AssumeRole."),
  bullet("운영 모니터링 — UptimeRobot 등으로 /healthz 폴링, 인제스트 실패 알림 채널."),
];

const doc = new Document({
  creator: "TBT",
  title: "Kiro 통합 랭킹 대시보드 제안서 요약",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
  },
  sections: [
    {
      properties: {
        page: { margin: { top: 800, right: 1000, bottom: 800, left: 1000 } },
      },
      children,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
const out = "c:/tmp/Kiro-제안서-요약.docx";
writeFileSync(out, buf);
console.log("✓ 생성 완료:", out, `(${buf.length} bytes)`);
