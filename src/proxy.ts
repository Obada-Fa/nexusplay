import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FORCE_HOST_PARAM, isControllerRequest } from "@/lib/device";

// Phones never need the TV screen: send them straight to the controller, keeping ?code=.
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/host" && searchParams.get(FORCE_HOST_PARAM) === "host") return NextResponse.next();
  const ua = request.headers.get("user-agent"), chMobile = request.headers.get("sec-ch-ua-mobile");
  if (isControllerRequest(ua, chMobile)) {
    const url = request.nextUrl.clone();
    url.pathname = "/join";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/host"] };
