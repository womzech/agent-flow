import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC_PREFIXES = ["/login", "/share/", "/api/health", "/_next/", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If AGENTFORGE_PASSWORD is unset, run open (dev mode). Document this in
  // .env.example so operators know the security posture they're choosing.
  if (!process.env.AGENTFORGE_PASSWORD) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const verdict = await verifySession(cookie);
  if (verdict.ok) return NextResponse.next();

  // API paths return JSON 401 so the client can handle without redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", code: "auth/required" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except Next.js internals; the function above filters out
  // the actual public routes (more flexible than matcher regex).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
