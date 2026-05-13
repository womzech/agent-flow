import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { SESSION_COOKIE } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { revokeJti } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) {
    return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });
  }
  // Revoke the server-side session row so the cookie is invalidated even if
  // the browser ignores Set-Cookie clear (e.g. shared/incognito tab race).
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const sid = decodeSidFromCookie(cookie);
    if (sid) {
      const revoked = revokeJti(sid);
      if (revoked) record({ action: "auth.logout", entity: "session", payload: { sid } });
    }
  }
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/login", base), 303);
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}

function decodeSidFromCookie(token: string): string | null {
  const body = token.split(".")[0];
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const std = (body + pad).replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(std)) as { sid?: string };
    return typeof obj.sid === "string" ? obj.sid : null;
  } catch {
    return null;
  }
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
