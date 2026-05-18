import type { Metadata } from "next";
import "./globals.css";

// OG / Twitter 이미지 절대 URL 해석용. 운영은 APP_BASE_URL, 로컬은 localhost fallback.
const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "AWS Kiro 사용 현황 · 통합 랭킹",
  description: "회사가 조직에 제공한 AWS Kiro 사용 현황 — 학생 토큰 사용량 / 출석 통합 랭킹",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" style={{ colorScheme: "light" }}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <meta name="color-scheme" content="light" />
      </head>
      <body
        className="min-h-full flex flex-col"
        style={{ background: "#fafafa", color: "#16191f" }}
      >
        {children}
      </body>
    </html>
  );
}
