// 탈퇴 학생의 살아있는 다른 디바이스 세션을 정리하는 전용 route handler.
//
// 흐름:
//   1. requireActiveStudent 가 deactivated 발견 → /logout-deactivated 로 redirect
//   2. 이 route 가 학생 세션 쿠키 destroy (server component 에서는 못 함)
//   3. /login?deactivated=1 으로 redirect
//   4. /login 페이지는 이제 빈 세션이라 메시지 박스만 렌더링 (무한 루프 X)

import { NextResponse } from "next/server";
import { getStudentSession } from "@/lib/student-auth";

export async function GET(request: Request) {
  const session = await getStudentSession();
  await session.destroy();

  // Docker 안에서 request.url 이 0.0.0.0:3000 으로 잡히는 케이스 회피.
  // 실제 클라이언트가 본 host (nginx 가 넘긴 Host 헤더) 로 absolute URL 만듦.
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return NextResponse.redirect(`${proto}://${host}/login?deactivated=1`);
}
