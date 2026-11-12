import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 접속 보호 (PLAN 20번, 설계서 3-5)
// 로그인 기능이 없는 공개 주소에서는 주소를 아는 누구나 AI 비용(OpenAI)을 쓸 수 있어요.
// 그래서 화면과 /api/* 요청을 모두 "비밀번호 확인"으로 막습니다. (브라우저의 기본 로그인 창이 떠요)
//  - 비밀번호는 환경변수 APP_PASSWORD 에 둡니다. (사용자 이름은 아무거나 괜찮아요)
//  - 배포 환경에서 APP_PASSWORD가 없으면 안전하게 "전부 막기"로 동작합니다.
//  - 내 컴퓨터에서 개발할 때(npm run dev)는 APP_PASSWORD가 없으면 그냥 열려요.
// 이 버전의 Next.js에서는 middleware가 proxy로 이름이 바뀌었습니다. (node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md)

// 두 글자열이 같은지 걸리는 시간으로 힌트를 주지 않게 비교합니다.
function safeEqual(a: string, b: string) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function passwordFrom(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  try {
    // "사용자:비밀번호" 모양을 UTF-8로 풀어요 (한글 비밀번호도 되게)
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const i = decoded.indexOf(":");
    return i < 0 ? null : decoded.slice(i + 1);
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;

  if (!expected) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next(); // 내 컴퓨터 개발 중에는 열어 둬요
    return new NextResponse("접속 비밀번호(APP_PASSWORD)가 설정되지 않아 접속을 막았어요. 관리자에게 알려 주세요.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const given = passwordFrom(request);
  if (given !== null && safeEqual(given, expected)) return NextResponse.next();

  return new NextResponse("비밀번호가 필요해요.", {
    status: 401,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "www-authenticate": 'Basic realm="Maritime RegWatch", charset="UTF-8"',
    },
  });
}

export const config = {
  // 정적 파일(빌드된 화면 조각, 아이콘, PDF 읽기용 파일)은 비밀번호 없이도 받게 두고, 나머지는 모두 확인해요.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|pdfjs/).*)"],
};
