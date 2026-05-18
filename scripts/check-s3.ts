// S3 접근 검증용 일회성 스크립트.
// .env.local 의 AWS 자격증명으로 ***REMOVED-BUCKET***/<prefix>/ 아래 객체 리스트.
//
// 실행: npm run check-s3

import {
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const BUCKET = "***REMOVED-BUCKET***";
const PREFIX = "***REMOVED-PREFIX***/";
const DEFAULT_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

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

main().catch((err) => {
  console.error("[check-s3] 실패:", err.name, "-", err.message);
  if (err.$metadata) console.error("  metadata:", err.$metadata);
  process.exit(1);
});
