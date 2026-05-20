// connection 별 S3 버킷에서 Kiro user activity report CSV 다운로드.
// role_arn 이 있으면 STS AssumeRole 로 cross-account 접근.

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type { Connection } from "@/lib/types";

const BASE_REGION = process.env.AWS_REGION ?? "ap-northeast-2";

async function makeS3Client(conn: Connection): Promise<S3Client> {
  const region = conn.s3Region ?? BASE_REGION;

  if (!conn.roleArn) {
    return new S3Client({ region });
  }

  const sts = new STSClient({ region: BASE_REGION });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: conn.roleArn,
      RoleSessionName: `kiro-ingest-${conn.id}`,
      DurationSeconds: 3600,
    }),
  );
  if (!Credentials) throw new Error(`AssumeRole failed for connection ${conn.id}`);

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
function buildPrefix(conn: Connection, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const region = conn.s3Region ?? BASE_REGION;
  const base = conn.s3Prefix ? `${conn.s3Prefix}/` : "";
  return `${base}AWSLogs/${conn.awsAccountId}/KiroLogs/user_report/${region}/${y}/${m}/${d}/00/`;
}

export interface CsvFile {
  key: string;
  buffer: Buffer;
}

export async function downloadCsvFiles(
  conn: Connection,
  date: Date,
): Promise<CsvFile[]> {
  if (!conn.s3Bucket || !conn.awsAccountId) {
    throw new Error(
      `connection ${conn.id}: s3_bucket 또는 aws_account_id 미설정`,
    );
  }

  const s3 = await makeS3Client(conn);
  const prefix = buildPrefix(conn, date);

  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: conn.s3Bucket, Prefix: prefix }),
  );

  const keys = (listed.Contents ?? [])
    .map((o) => o.Key!)
    .filter((k) => k.endsWith(".csv"));

  const files: CsvFile[] = [];
  for (const key of keys) {
    const resp = await s3.send(
      new GetObjectCommand({ Bucket: conn.s3Bucket, Key: key }),
    );
    const bytes = await resp.Body!.transformToByteArray();
    files.push({ key, buffer: Buffer.from(bytes) });
  }

  return files;
}
