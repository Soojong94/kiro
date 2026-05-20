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

      {/* Step 1 */}
      <Section title="1. 모델 이해" tone="info">
        <p>
          <strong>connection</strong> = AWS 계정 1개 + 그 안의 Identity Center 1개 + Kiro CSV 가 떨어지는 S3 1개. 한 connection 이 여러 학교(IC 그룹) 호스팅 가능.
        </p>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><Code>schools</Code> 행은 sync 가 IC 그룹에서 자동 생성 (id = 그룹명)</li>
          <li><Code>students</Code> 행은 sync 가 IC 사용자에서 자동 생성 (user_id = AWS UUID)</li>
          <li>슈퍼 어드민이 손댈 건 <strong>connection 1건 등록</strong> 뿐</li>
        </ul>
      </Section>

      {/* Step 2 */}
      <Section title="2. 입력 필드 의미">
        <Field name="id" required>
          식별자. 영문 소문자/숫자/하이픈/언더스코어. 예: <Code>chosun-aws</Code>, <Code>tbit-main</Code>. 한 번 정하면 변경 불가.
        </Field>
        <Field name="표시명" required>
          어드민 화면에 보이는 이름. 예: <Code>조선대학교 AWS</Code>.
        </Field>
        <Field name="AWS 계정 ID">
          12자리 숫자. 학교가 합류할 AWS 계정 번호. 학교 측에 문의해서 확인 (Kiro 가 설치된 계정).
        </Field>
        <Field name="Role ARN">
          <strong>cross-account 일 때만 입력.</strong> 우리 계정이 학교 계정 안의 role 을 AssumeRole 해서 S3/IC 에 접근하는 방식. 비워두면 우리 base 자격증명으로 직접 접근 (= 같은 AWS 계정 안에서 동작).
          <br />
          형식: <Code>arn:aws:iam::&lt;학교계정ID&gt;:role/kiro-read</Code>
        </Field>
        <Field name="IC 인스턴스 ID">
          학교 측 Identity Center 인스턴스의 store ID. AWS Console → IAM Identity Center → Settings 에서 <Code>Identity store ID</Code> 확인. 예: <Code>d-1234567890</Code>.
          <br />
          이 값이 있어야 <Code>sync-identity-center</Code> 가 그 IC 의 그룹/사용자를 학교/학생으로 가져옴.
        </Field>
        <Field name="IC 리전">
          IC 인스턴스가 있는 AWS 리전. 보통 <Code>us-east-1</Code> (Kiro 서비스 자체가 us-east-1 기반).
        </Field>
        <Field name="S3 버킷">
          Kiro 가 user activity report CSV 를 떨어뜨리는 버킷 이름. 학교가 Kiro Console 에서 지정한 그 값.
        </Field>
        <Field name="S3 prefix">
          버킷 내 경로 접두사 (옵션). 학교가 prefix 를 지정했다면 그 값. 예: <Code>kiro-reports</Code>. 없으면 비움.
        </Field>
        <Field name="S3 리전">
          S3 버킷의 리전. 보통 IC 와 같은 us-east-1 이지만 다를 수 있으니 학교에 확인.
        </Field>
      </Section>

      {/* Step 3 */}
      <Section title="3. 같은 AWS 계정 (cross-account 아닌 경우)" tone="info">
        <p>
          학교가 우리 측 AWS 계정의 IC 그룹에 추가되는 모델. 별도 권한 설정 없이 그냥 connection 1건 등록하면 끝.
        </p>
        <ol className="mt-2 list-decimal pl-5 space-y-1">
          <li>학교가 우리 IC 에 그룹 생성 + 학생 추가</li>
          <li>Kiro Console 에서 user activity report 활성화 (S3 URI 우리 버킷으로)</li>
          <li>여기 페이지에서 connection 등록 (Role ARN 비움)</li>
          <li><Code>npm run sync-identity-center</Code> 1회 — 학교/학생 자동 등록</li>
          <li>다음 ingest cron 부터 자동 수집</li>
        </ol>
      </Section>

      {/* Step 4 */}
      <Section title="4. 다른 AWS 계정 (cross-account)" tone="warn">
        <p>
          학교가 자기 AWS 계정 + 자기 IC + 자기 S3 를 가지는 모델. 우리 계정이 그쪽에 접근하려면 학교 측이 IAM Role 을 만들어 우리만 AssumeRole 가능하게 신뢰관계 설정해야 함.
        </p>
        <h4 className="mt-3 font-semibold text-[#16191f]">학교 측 작업</h4>
        <ol className="mt-1 list-decimal pl-5 space-y-1.5">
          <li>
            <strong>IAM → Roles → Create role</strong> → Custom trust policy:
            <Pre>{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<우리계정ID>:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "<사전 합의한 외부 ID>" }
    }
  }]
}`}</Pre>
          </li>
          <li>
            권한 정책 — S3 read + IC 조회:
            <Pre>{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::<학교버킷>",
        "arn:aws:s3:::<학교버킷>/*"
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
          </li>
          <li>role ARN 을 우리에게 전달 (예: <Code>arn:aws:iam::111122223333:role/kiro-read</Code>)</li>
        </ol>

        <h4 className="mt-4 font-semibold text-[#16191f]">우리 측 작업</h4>
        <ol className="mt-1 list-decimal pl-5 space-y-1">
          <li>이 페이지에서 connection 등록 — Role ARN 칸에 학교가 준 값 입력</li>
          <li>나머지 필드 (계정ID / IC 인스턴스 / S3 버킷 등) 채움</li>
          <li><Code>npm run sync-identity-center</Code> 1회 — 학교/학생 import 확인</li>
          <li><Code>npm run check-s3</Code> 로 S3 접근 확인 (옵션)</li>
        </ol>
      </Section>

      {/* Step 5 */}
      <Section title="5. 동작 검증">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            <Code>npm run sync-identity-center -- --dry</Code> — 실제 DB 변경 없이 어떤 학교/학생이 들어올지 미리보기
          </li>
          <li>
            실제 적용: <Code>npm run sync-identity-center</Code> (신규 학생만 INSERT, 기존은 절대 안 건드림)
          </li>
          <li>
            인제스트 1회: <Code>npm run ingest -- --date YYYY-MM-DD</Code>
          </li>
          <li>
            <Link href="/admin/schools" className="text-[#0972d3] underline">/admin/schools</Link>{" "}
            에서 새 학교가 추가됐는지 확인. <Link href="/admin/students" className="text-[#0972d3] underline">/admin/students</Link> 에서 학생 목록 확인.
          </li>
          <li>
            인제스트 결과는 학생 페이지 (<Link href="/" className="text-[#0972d3] underline">/</Link>) 에서 학교별 랭킹으로 확인.
          </li>
        </ol>
      </Section>

      {/* Step 6 */}
      <Section title="6. 문제 해결 (Troubleshooting)">
        <Trouble q="UnrecognizedClientException / InvalidClientTokenId">
          AWS 자격증명이 만료됐거나 잘못됨. 우리 base IAM 키를 새로 발급한 경우 컨테이너 재기동 (<Code>docker compose up -d --build next</Code>). cross-account 면 학교의 role ARN 이 정확한지 확인.
        </Trouble>
        <Trouble q="AccessDenied (S3)">
          방법 A 면 학교 버킷 정책에 우리 IAM 사용자가 정확히 들어가있는지. 방법 B 면 role 의 권한 정책에 S3 read 가 포함됐는지 + 신뢰관계의 ExternalId 가 일치하는지.
        </Trouble>
        <Trouble q="CSV 파일 없음">
          해당 날짜의 Kiro 리포트가 아직 안 생성됐을 가능성. Kiro 는 매일 02:00 UTC 에 전날 데이터 떨어뜨림. 어제 분이면 정상, 오늘 분은 내일 새벽에 옴.
        </Trouble>
        <Trouble q="학생 페이지에 사용량 0 으로만 보임">
          ingest 가 돌긴 했는데 daily_usage 가 비어있을 가능성. 로그 확인 — <Code>docker compose logs --tail=50 next</Code>. orphan 카운트가 높으면 sync-identity-center 가 안 돌았다는 뜻 (학생 행이 없어서 ingest 가 매핑 못 함).
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
