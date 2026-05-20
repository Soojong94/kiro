// S3 접근 검증용 일회성 스크립트.
// .env.local 의 AWS 자격증명으로 <bucket>/<prefix>/ 아래 객체 리스트.
//
// 실행:
//   KIRO_BUCKET=<버킷명> KIRO_PREFIX=<prefix/> npm run check-s3
//   (env 미지정 시 connections 테이블의 첫 행 자동 사용)

import {
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { pool } from "@/lib/db";

let BUCKET = process.env.KIRO_BUCKET ?? "";
let PREFIX = process.env.KIRO_PREFIX ?? "";
const DEFAULT_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

async function loadFromConnections(): Promise<void> {
  if (BUCKET) return;
  const { rows } = await pool.query<{ s3_bucket: string | null; s3_prefix: string | null }>(
    `SELECT s3_bucket, s3_prefix FROM connections
      WHERE s3_bucket IS NOT NULL ORDER BY created_at LIMIT 1`,
  );
  const r = rows[0];
  if (!r?.s3_bucket) {
    console.error("[check-s3] KIRO_BUCKET env 도 없고 connections 에도 S3 설정된 행이 없음");
    process.exit(1);
  }
  BUCKET = r.s3_bucket;
  PREFIX = r.s3_prefix ? `${r.s3_prefix}/` : "";
}

async function resolveBucketRegion(): Promise<string> {
  // HeadBucket 은 리전 미스매치여도 응답에 x-amz-bucket-region 반환.
  // us-east-1 로 먼저 찔러서 실제 리전 알아냄.
  const probe = new S3Client({ region: "us-east-1" });
  try {
    const out = (await probe.send(
      new HeadBucketCommand({ Bucket: BUCKET }),
    )) as { BucketRegion?: string };
    if (out.BucketRegion) return out.BucketRegion;
  } catch (err: unknown) {
    const e = err as { $response?: { headers?: Record<string, string> } };
    const headerRegion = e.$response?.headers?.["x-amz-bucket-region"];
    if (headerRegion) return headerRegion;
  }
  return DEFAULT_REGION;
}

async function main() {
  await loadFromConnections();
  console.log(`[check-s3] 버킷 ${BUCKET} 의 실제 리전 탐색 중...`);
  const region = await resolveBucketRegion();
  console.log(`[check-s3] 리전 확정: ${region}`);
  console.log(`[check-s3] s3://${BUCKET}/${PREFIX} 리스트 시도`);

  const s3 = new S3Client({ region });
  const out = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX,
      MaxKeys: 100,
    }),
  );

  const items = out.Contents ?? [];
  console.log(`[check-s3] 객체 ${items.length} 개 발견 (truncated=${out.IsTruncated ?? false})`);
  for (const o of items) {
    const size = (o.Size ?? 0).toLocaleString("en-US");
    const mtime = o.LastModified?.toISOString() ?? "?";
    console.log(`  - ${o.Key}  (${size} bytes, ${mtime})`);
  }
  if (items.length === 0) {
    console.log(
      "[check-s3] 접근은 성공했지만 아직 객체가 없음 — Kiro 가 첫 리포트를 떨어뜨릴 때까지 대기",
    );
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[check-s3] 실패:", err.name, "-", err.message);
    if (err.$metadata) console.error("  metadata:", err.$metadata);
    await pool.end().catch(() => {});
    process.exit(1);
  });
