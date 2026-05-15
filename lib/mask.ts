// 학생명 마스킹. 공개 화면은 반드시 이 함수를 거친 값만 사용한다.
//
// 규칙: **짝수 번째(1-index 기준 2,4,6,…) 글자를 `*`로 치환.**
// - 길이별 분기 없이 5자 이상도 일관되게 동작.
// - 한글/영문/숫자/혼합 모두 동일 규칙 (코드 포인트 단위로 슬라이스).
//
// 예) 김민    → 김*
//     김민준  → 김*준
//     남궁민준 → 남*민*
//     사공유리 → 사*유*
//     제갈공명운 → 제*공*운
//     John → J*h*
//     홍 → 홍 (외자는 그대로)

export function maskName(raw: string): string {
  const name = (raw ?? "").trim();
  if (!name) return "익명";
  const chars = [...name]; // surrogate-pair 안전
  return chars.map((c, i) => (i % 2 === 1 ? "*" : c)).join("");
}
