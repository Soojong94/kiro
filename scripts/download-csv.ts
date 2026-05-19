// Kiro user activity report CSV 로컬 다운로드 + 헤더/샘플 미리보기.
// 첫 CSV 형식 분석용. 실제 인제스트는 안 함 — 파일만 받고 내용 보여줌.
//
// 실행:
//   npm run download-csv                       # 어제 일자
//   npm run download-csv -- --date 2026-05-18  # 특정 날짜
//
// 저장 위치: ./samples/raw/<date>/<원본 파일명>.csv

import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BUCKET = "***REMOVED-BUCKET***";
const PREFIX_BASE = "***REMOVED-PREFIX***/";
const ACCOUNT_ID = "123456789012";

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function resolveBucketRegion(): Promise<string> {
  const probe = new S3Client({ region: "us-east-1" });
  try {
    const out = (await probe.send(
      new HeadBucketCommand({ Bucket: BUCKET }),
    )) as { BucketRegion?: string };
    if (out.BucketRegion) return out.BucketRegion;
  } catch (err: unknown) {
    const e = err as { $response?: { headers?: Record<string, string> } };
    const hdr = e.$response?.headers?.["x-amz-bucket-region"];
    if (hdr) return hdr;
  }
  return "us-east-1";
}

function previewFile(filename: string, content: string): void {
  console.log("");
  console.log("──────────────────────────────────────────────────────────");
  console.log(`📄 ${filename}`);
  console.log("──────────────────────────────────────────────────────────");
  const lines = content.split(/\r?\n/);
  const total = lines.filter((l) => l.length > 0).length;
  console.log(`데이터 행 수: ${total} (헤더 포함)`);
  console.log("");
  console.log("[ 헤더 컬럼 ]");
  const headers = lines[0]?.split(",") ?? [];
  headers.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
  console.log("");
  console.log("[ 첫 3 데이터 행 ]");
  lines.slice(1, 4).forEach((line, i) => {
    if (!line) return;
    console.log(`  ${i + 1}: ${line.length > 200 ? line.slice(0, 200) + "..." : line}`);
  });
}

async function main() {
  const dateStr = getArg("date") ?? yesterdayStr();
  console.log(`[download-csv] 대상 일자: ${dateStr}`);

  const region = await resolveBucketRegion();
  console.log(`[download-csv] 버킷 리전: ${region}`);
  const s3 = new S3Client({ region });

  // Kiro 경로 패턴: <prefix>/AWSLogs/<accountId>/KiroLogs/user_report/<region>/<yyyy>/<mm>/<dd>/00/
  const [y, m, d] = dateStr.split("-");
  const folderPrefix =
    `${PREFIX_BASE}AWSLogs/${ACCOUNT_ID}/KiroLogs/user_report/${region}/${y}/${m}/${d}/00/`;

  console.log(`[download-csv] 검색 prefix: ${folderPrefix}`);
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: folderPrefix }),
  );
  const keys = (list.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k) => k.endsWith(".csv"));

  if (keys.length === 0) {
    console.log(`[download-csv] ❌ 해당 일자 CSV 없음.`);
    console.log("  - Kiro 가 아직 안 떨굴 수 있음 (매일 02:00 UTC = 한국 11:00 AM 직후)");
    console.log("  - 또는 prefix/리전 설정 불일치");
    // 상위 폴더 한 단계 더 listing 시도
    console.log("\n참고: prefix 한 단계 위로 listing —");
    const wider = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `${PREFIX_BASE}AWSLogs/${ACCOUNT_ID}/KiroLogs/user_report/`,
        MaxKeys: 30,
      }),
    );
    for (const o of wider.Contents ?? []) {
      console.log(`  - ${o.Key} (${o.Size ?? 0} B)`);
    }
    return;
  }

  console.log(`[download-csv] ${keys.length} 개 CSV 발견 — 다운로드 시작`);
  const outDir = path.resolve(`./samples/raw/${dateStr}`);
  await mkdir(outDir, { recursive: true });

  for (const key of keys) {
    const filename = path.basename(key);
    const outPath = path.join(outDir, filename);

    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const buf = Buffer.from(await obj.Body!.transformToByteArray());
    await writeFile(outPath, buf);

    // BOM 제거 후 텍스트로 디코드
    const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
    previewFile(filename, text);
    console.log(`💾 저장: ${outPath} (${buf.length.toLocaleString()} bytes)`);
  }

  console.log("");
  console.log(`✅ 완료 — ${outDir} 에서 .csv 파일 직접 열어서 확인 가능`);
}

main().catch((err) => {
  console.error("[download-csv] 실패:", err);
  process.exit(1);
});
