import { NextResponse, type NextRequest } from "next/server";

import { SAVE_DATA_COOKIE, SAVE_DATA_HEADER, getSaveDataCookieAction } from "@/lib/saveData";

/**
 * Mirrors the `Save-Data` request header into a cookie that client components
 * can read (#1748), so image quality adapts even in browsers that send the
 * header but do not expose `navigator.connection.saveData`.
 *
 * The cookie is only written when the preference changes, so ordinary page
 * views do not carry a `Set-Cookie` header.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const action = getSaveDataCookieAction(
    request.headers.get(SAVE_DATA_HEADER),
    request.cookies.get(SAVE_DATA_COOKIE)?.value
  );

  if (action === "set") {
    response.cookies.set(SAVE_DATA_COOKIE, "1", { path: "/", sameSite: "lax" });
  } else if (action === "delete") {
    response.cookies.delete(SAVE_DATA_COOKIE);
  }

  return response;
}

export const config = {
  // Pages only: skip API routes, build assets, optimized images and files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|logo/|\\.well-known/).*)"],
};
