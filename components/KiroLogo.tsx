// 사용자 제공 Kiro 로고 (보라 배경 + 흰 KIRO 워드마크).
// 로고 자체에 배경이 있으므로 그대로 노출.

export function KiroLogo() {
  return (
    <a
      href="https://kiro.dev"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center"
      aria-label="AWS Kiro"
    >
      {/* 자연 비율 유지 위해 plain img 사용 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/kiro-logo.jpg"
        alt="AWS Kiro"
        className="h-10 sm:h-11 lg:h-12 w-auto rounded-md"
      />
    </a>
  );
}
