// 카톡/슬랙/링크 미리보기용 OG 이미지. favicon 디자인 그대로 키움.
// Next.js 메타데이터 컨벤션 — 자동으로 <meta property="og:image"> + twitter:image 등록.

import { ImageResponse } from "next/og";

export const alt = "AWS KIRO · 사용량 통합랭킹";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#232f3e",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
        }}
      >
        {/* K 모노그램 — favicon SVG 와 동일한 비율, 크게 키움 */}
        <svg width="320" height="320" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="6" fill="#232f3e" />
          <g
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            <line x1="10" y1="7" x2="10" y2="22" />
            <line x1="10" y1="14.5" x2="22" y2="7" />
            <line x1="10" y1="14.5" x2="22" y2="22" />
          </g>
          <rect
            x="6"
            y="25"
            width="20"
            height="2.5"
            rx="1.25"
            fill="#ec7211"
          />
        </svg>

        {/* 워드마크 */}
        <div
          style={{
            marginTop: 36,
            color: "#ffffff",
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: 2,
          }}
        >
          AWS KIRO
        </div>
        <div
          style={{
            marginTop: 8,
            color: "#d1d5db",
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: 1,
          }}
        >
          USAGE LEADERBOARD
        </div>

        {/* 오렌지 시그니처 바 (하단) */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: 12,
            background: "#ec7211",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
