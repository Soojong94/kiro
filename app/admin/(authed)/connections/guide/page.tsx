import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const metadata = {
  title: "AWS 연결 가이드 · Kiro 관리자",
};

export default async function ConnectionGuidePage() {
  const me = await requireAdmin();
  if (me.role !== "super") redirect("/admin");

  return (
    <main className="mx-auto max-w-4xl px-5 sm:px-6 py-8">
      <Link
        href="/admin/connections"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-[#5f6b7a] hover:text-[#0972d3] cursor-pointer mb-3"
      >
        ← AWS 연결 목록으로
      </Link>

      <header className="mb-6">
        <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[#16191f]">
          AWS 연결 가이드
        </h1>
        <p className="mt-1 text-[12.5px] text-[#5f6b7a]">
          신규 학교/조직을 connection 으로 추가하는 절차.
        </p>
      </header>

      {/* TL;DR */}
      <Section title="요약 (TL;DR)" tone="info">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            우리 측 IAM 키에 <strong>S3 read + Identity Center read 권한</strong> 부여 (같은 AWS 계정이어도 필요)
          </li>
          <li>cross-account 면 학교 측이 우리에게 <strong>Role ARN</strong> 제공 (방법 B)</li>
          <li>이 페이지의 <strong>＋ 새 connection 등록</strong> 폼에 값 입력</li>
          <li>
            <Code>npm run sync-identity-center -- --dry</Code> 로 검증 → 실제 적용
          </li>
        </ol>
      </Section>

      {/* IAM 권한 — 같은 계정/cross-account 공통 */}
      <Section title="1. 우리 측 IAM 권한 (필수)">
        <p>
          같은 AWS 계정이든 cross-account 든, <strong>우리 IAM 사용자/role 에 다음 권한 없으면 sync/ingest 가 거부됨.</strong>
        </p>
        <p className="mt-2">최소 권한 정책:</p>
        <Pre>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Read",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<우리 또는 학교 버킷>",
        "arn:aws:s3:::<우리 또는 학교 버킷>/*"
      ]
    },
    {
      "Sid": "ICRead",
      "Effect": "Allow",
      "Action": [
        "sso:ListInstances",
        "identitystore:ListGroups",
        "identitystore:ListUsers",
        "identitystore:ListGroupMemberships"
      ],
      "Resource": "*"
    },
    {
      "Sid": "STSAssumeRole",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/kiro-*"
    }
  ]
}`}</Pre>
        <p className="text-[12px] text-[#5f6b7a] mt-2">
          마지막 <Code>sts:AssumeRole</Code> 은 cross-account 시에만 필요. 같은 계정만 쓸 거면 빼도 됨.
        </p>
      </Section>

      {/* 입력 필드 */}
      <Section title="2. connection 필드 의미 (수동 입력)">
        <p className="mb-2">
          sync 가 자동으로 채우는 건 <strong>학교/학생 행</strong> 뿐. connection 자체는 슈퍼 어드민이 한 번 등록해야 함:
        </p>
        <Field name="id" required>
          식별자. 영문 소문자/숫자/하이픈/언더스코어, 2~32자. 예: <Code>chosun-aws</Code>. 한 번 정하면 변경 불가
        </Field>
        <Field name="표시명" required>
          어드민 화면 표시 이름. 예: <Code>조선대학교 AWS</Code>
        </Field>
        <Field name="AWS 계정 ID">
          12자리 숫자. 학교가 합류한 AWS 계정 번호
        </Field>
        <Field name="Role ARN">
          <strong>cross-account 일 때만 입력.</strong> 우리 계정이 학교 계정의 role 을 AssumeRole. 비우면 우리 base 자격증명 직접 사용
        </Field>
        <Field name="IC 인스턴스 ID">
          Identity Center 인스턴스 store ID — AWS Console → IAM Identity Center → Settings 의 <Code>Identity store ID</Code>. 예: <Code>d-XXXXXXXXXX</Code>. <strong>이게 있어야 sync 가 그쪽 IC 의 그룹/사용자를 학교/학생으로 import</strong>
        </Field>
        <Field name="IC 리전">
          IC 인스턴스 리전. 보통 <Code>us-east-1</Code>
        </Field>
        <Field name="S3 버킷 / S3 prefix / S3 리전">
          Kiro 가 user activity report CSV 떨어뜨리는 위치. 학교가 Kiro Console 에서 지정한 값. prefix 는 옵션
        </Field>

        <div className="mt-4 p-3 rounded-md bg-[#fafafa] ring-1 ring-[#eaeded]">
          <div className="text-[11.5px] font-semibold text-[#5f6b7a] mb-2">📋 채워진 예시</div>
          <Pre>{`id              : chosun-aws
표시명          : 조선대학교 AWS
AWS 계정 ID    : 111122223333
Role ARN       : arn:aws:iam::111122223333:role/kiro-read
IC 인스턴스 ID : d-1234567890
IC 리전        : us-east-1
S3 버킷        : chosun-kiro-reports
S3 prefix      : kiro-reports
S3 리전        : us-east-1`}</Pre>
          <div className="text-[11.5px] text-[#5f6b7a] mt-2">
            ↑ <Code>111122223333</Code>, <Code>d-1234567890</Code> 등은 모두 예시값. 실제 값은 학교 측 AWS Console 에서 확인.
          </div>
        </div>
      </Section>

      {/* 시나리오 A — 같은 계정 */}
      <Section title="3. 시나리오 A — 같은 AWS 계정">
        <p>학교 그룹이 우리 AWS 계정의 IC 안에 있고, Kiro 도 우리 S3 에 떨어뜨리는 경우 (현재 TBIT/조선/광주 구성)</p>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>우리 IAM 키에 위 §1 의 권한 부여 (이미 했으면 skip)</li>
          <li>학교 그룹 + 학생을 IC 에 추가</li>
          <li>여기 페이지 <strong>＋ 새 connection 등록</strong>:
            <ul className="list-disc pl-5 mt-1">
              <li><strong>Role ARN 비움</strong></li>
              <li>나머지 (IC ID, S3 버킷 등) 우리 값으로 채움</li>
            </ul>
          </li>
          <li><Code>npm run sync-identity-center</Code> → 학교/학생 자동 등록</li>
          <li>다음 ingest cron 부터 자동 수집</li>
        </ol>
      </Section>

      {/* 시나리오 B — cross-account */}
      <Section title="4. 시나리오 B — 학교가 자기 AWS 계정 사용" tone="warn">
        <p>학교가 자기 AWS 계정 + 자기 IC + 자기 S3 운영. 우리 계정에서 그쪽으로 AssumeRole.</p>

        <h4 className="mt-3 font-semibold text-[#16191f]">학교 측 작업 (한 번)</h4>
        <p className="mt-1">IAM → Roles → Create role → Custom trust policy:</p>
        <Pre>{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<우리 계정ID>:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<사전 합의한 외부 ID>" }
    }
  }]
}`}</Pre>
        <p className="mt-2">권한 정책 — §1 의 S3+IC read 그대로 (단 Resource 는 학교 자기 버킷으로):</p>
        <Pre>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<학교 버킷>",
        "arn:aws:s3:::<학교 버킷>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "identitystore:ListGroups",
        "identitystore:ListUsers",
        "identitystore:ListGroupMemberships"
      ],
      "Resource": "*"
    }
  ]
}`}</Pre>
        <p className="mt-2">학교가 role ARN (예 <Code>arn:aws:iam::111122223333:role/kiro-read</Code>) 을 우리에게 전달.</p>

        <h4 className="mt-4 font-semibold text-[#16191f]">우리 측 작업</h4>
        <ol className="list-decimal pl-5 space-y-1">
          <li>우리 IAM 키에 §1 권한 + <Code>sts:AssumeRole</Code> 권한 있는지 확인</li>
          <li>여기 페이지 <strong>＋ 새 connection 등록</strong>: 학교가 준 Role ARN 입력 + 나머지 IC/S3 정보 채움</li>
          <li><Code>npm run sync-identity-center</Code> → 자동 import</li>
        </ol>
      </Section>

      {/* 문제 해결 */}
      <Section title="5. 문제 해결">
        <Trouble q="UnrecognizedClientException / InvalidClientTokenId">
          우리 AWS 자격증명 만료 또는 잘못됨. 운영 키 새로 발급한 경우 컨테이너 재기동:{" "}
          <Code>docker compose -f docker-compose.prod.yml up -d --build next</Code>
        </Trouble>
        <Trouble q="AccessDenied (S3)">
          §1 의 IAM 정책에 S3 read 빠짐. 같은 계정이어도 명시적으로 부여 필요. cross-account 면 학교 측 role 의 권한 정책도 확인
        </Trouble>
        <Trouble q="AccessDenied (Identity Center)">
          §1 의 <Code>identitystore:*</Code> 권한 빠짐
        </Trouble>
        <Trouble q="sync 가 그룹 0개로 끝남">
          IC 인스턴스 ID 가 잘못됐을 가능성. AWS Console 의 store ID 와 정확히 일치해야 함 (d-XXXXXXXXXX 형식)
        </Trouble>
        <Trouble q="CSV 파일 없음">
          해당 날짜 Kiro 리포트가 아직 안 생성됨. Kiro 는 매일 02:00 UTC 에 <strong>전날</strong> 데이터 떨어뜨림. 어제 분이면 정상, 오늘 분은 내일 새벽
        </Trouble>
        <Trouble q="학생 사용량 0 으로만 보임">
          ingest 의 <Code>orphan</Code> 카운트가 높은지 확인. sync-identity-center 가 먼저 돌아서 학생 행이 있어야 ingest 가 매핑함
        </Trouble>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "info" | "warn";
}) {
  const ring =
    tone === "info"
      ? "ring-[#cce4f5] bg-[#f7fbfd]"
      : tone === "warn"
        ? "ring-[#f1c0bf] bg-[#fff8f7]"
        : "ring-[#eaeded] bg-white";
  return (
    <section className={`mb-5 rounded-lg p-5 ring-1 ${ring} shadow-[0_1px_2px_rgba(0,28,36,0.05)]`}>
      <h2 className="text-[15px] font-bold text-[#16191f] mb-3">{title}</h2>
      <div className="text-[13px] text-[#414d5c] leading-relaxed space-y-1">
        {children}
      </div>
    </section>
  );
}

function Field({
  name,
  required,
  children,
}: {
  name: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="py-2 first:pt-0 last:pb-0 border-b last:border-0 border-[#f4f5f6]">
      <div className="font-semibold text-[#16191f]">
        {name}
        {required && <span className="ml-1 text-[#d13212]">*</span>}
      </div>
      <div className="mt-0.5 text-[12.5px] text-[#414d5c]">{children}</div>
    </div>
  );
}

function Trouble({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="py-2 border-b last:border-0 border-[#f4f5f6]">
      <summary className="cursor-pointer font-semibold text-[#16191f] hover:text-[#0972d3]">
        ❓ {q}
      </summary>
      <div className="mt-2 text-[12.5px] text-[#414d5c]">{children}</div>
    </details>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded bg-[#f4f5f6] font-mono text-[12px] text-[#0972d3]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="mt-2 mb-1 p-3 rounded-md bg-[#16191f] text-[#d1d5db] text-[11.5px] font-mono leading-snug overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}
