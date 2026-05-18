// 학교별 S3 버킷에서 Kiro user activity report CSV를 다운로드.
// role_arn 이 있으면 STS AssumeRole로 cross-account 접근.

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { School } from "@/lib/types";

const BASE_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

async function makeS3Client(school: School): Promise<S3Client> {
  const region = school.awsRegion ?? BASE_REGION;

  if (!school.roleArn) {
    return new S3Client({ region });
  }

  const sts = new STSClient({ region: BASE_REGION });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: school.roleArn,
      RoleSessionName: `kiro-ingest-${school.id}`,
      DurationSeconds: 3600,
    }),
  );
  if (!Credentials) throw new Error(`AssumeRole failed for school ${school.id}`);

  return new S3Client({
    region,
    credentials: {
      accessKeyId: Credentials.AccessKeyId!,
      secretAccessKey: Credentials.SecretAccessKey!,
      sessionToken: Credentials.SessionToken,
    },
  });
}

// S3 키 패턴:
// <prefix>/AWSLogs/<accountId>/KiroLogs/user_report/<region>/<yyyy>/<mm>/<dd>/00/
function buildPrefix(school: School, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const region = school.awsRegion ?? BASE_REGION;
  const base = school.s3Prefix ? `${school.s3Prefix}/` : "";
  return `${base}AWSLogs/${school.awsAccountId}/KiroLogs/user_report/${region}/${y}/${m}/${d}/00/`;
}

export interface CsvFile {
  key: string;
  buffer: Buffer;
}

export async function downloadCsvFiles(
  school: School,
  date: Date,
): Promise<CsvFile[]> {
  if (!school.s3Bucket || !school.awsAccountId) {
    throw new Error(
      `school ${school.id}: s3_bucket 또는 aws_account_id 미설정`,
    );
  }

  const s3 = await makeS3Client(school);
  const prefix = buildPrefix(school, date);

  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: school.s3Bucket, Prefix: prefix }),
  );

  const keys = (listed.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k) => k.endsWith(".csv"));

  const files: CsvFile[] = [];
  for (const key of keys) {
    const resp = await s3.send(
      new GetObjectCommand({ Bucket: school.s3Bucket, Key: key }),
    );
    const bytes = await resp.Body!.transformToByteArray();
    files.push({ key, buffer: Buffer.from(bytes) });
  }

  return files;
}
