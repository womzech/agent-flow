import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) {
    return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/login", base), 303);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

/**
 * GET intentionally removed in v0.4: <img src="/api/auth/logout"> drive-by
 * logout was a CSRF vector. Clients MUST POST with the CSRF header.
 */
export async function GET() {
  return NextResponse.json(
    { error: "use POST for logout", code: "method/not-allowed" },
    { status: 405, headers: { allow: "POST" } },
  );
}
