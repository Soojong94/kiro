import Image from "next/image";

// 다크 NavBar 안에 들어가는 흰색 로고. 배경 칩 없이 그대로 노출.
export function TbitLogo() {
  return (
    <a
      href="https://tbit.co.kr"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center"
      aria-label="으뜸정보기술 TBIT"
    >
      <Image
        src="/logo-tbit-white.png"
        alt="으뜸정보기술 TBIT"
        width={2104}
        height={513}
        priority
        className="h-8 sm:h-9 lg:h-10 w-auto"
      />
    </a>
  );
}
