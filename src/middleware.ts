import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC_PREFIXES = [
  "/login",
  "/share/",
  "/api/health",
  "/api/wecom/",     // WeCom callback must be reachable without a session.
  "/_next/",
  "/favicon.ico",
];

const CSRF_COOKIE = "csrf_token";

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    // Still seed a CSRF cookie on first contact so the login form has one
    // when it submits.
    const res = NextResponse.next();
    await maybeSetCsrfCookie(req, res);
    return res;
  }

  // If AGENTFORGE_PASSWORD is unset, run open (dev mode). Document this in
  // .env.example so operators know the security posture they're choosing.
  if (!process.env.AGENTFORGE_PASSWORD) {
    const res = NextResponse.next();
    await maybeSetCsrfCookie(req, res);
    return res;
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const verdict = await verifySession(cookie);
  if (verdict.ok) {
    const sub = cookie ? decodeSubFromToken(cookie) : null;
    const reqHeaders = new Headers(req.headers);
    if (sub) reqHeaders.set("x-agentforge-user-id", String(sub));
    const res = NextResponse.next({ request: { headers: reqHeaders } });
    await maybeSetCsrfCookie(req, res);
    return res;
  }

  // API paths return JSON 401 so the client can handle without redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", code: "auth/required" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  const res = NextResponse.redirect(url);
  await maybeSetCsrfCookie(req, res);
  return res;
}

async function maybeSetCsrfCookie(req: NextRequest, res: NextResponse) {
  if (req.cookies.get(CSRF_COOKIE)) return;
  const token = await mintCsrfTokenEdge();
  res.cookies.set(CSRF_COOKIE, token, {
    // NOT HttpOnly: client JS needs to read it to echo in `x-csrf-token`.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,  // 14 days; rotated whenever session secret changes
  });
}

/**
 * Edge-safe CSRF token mint. Uses globalThis.crypto.subtle (available in
 * both Edge and Node 18.17+) so the same code runs in middleware AND in
 * the test runner with the preamble polyfill.
 */
async function mintCsrfTokenEdge(): Promise<string> {
  const random = crypto.getRandomValues(new Uint8Array(18));
  const randomB64 = b64url(random);
  const secret = process.env.AGENTFORGE_SESSION_SECRET || process.env.AGENTFORGE_PASSWORD || "agentforge-default-csrf-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(randomB64)));
  // Match `lib/csrf.ts` server-side `sign()`: base64url, slice(0, 22).
  return `${randomB64}.${b64url(sig).slice(0, 22)}`;
}

function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeSubFromToken(token: string): number | null {
  const body = token.split(".")[0];
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const std = (body + pad).replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(std)) as { sub?: number };
    return typeof obj.sub === "number" ? obj.sub : null;
  } catch {
    return null;
  }
}

export const config = {
  // Match everything except Next.js internals; the function above filters out
  // the actual public routes (more flexible than matcher regex).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
