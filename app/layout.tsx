import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWS Kiro 사용 현황 · 학생 랭킹",
  description: "회사가 학교에 제공한 AWS Kiro 사용 현황 — 학생 토큰 사용량 / 출석 통합 랭킹",
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
        style={{ background: "#f4f5f7", color: "#191f28" }}
      >
        {children}
      </body>
    </html>
  );
}
