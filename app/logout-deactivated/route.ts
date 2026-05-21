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
  return NextResponse.redirect(new URL("/login?deactivated=1", request.url));
}
