/**
 * Double-submit cookie CSRF protection for `/api/*` mutating endpoints.
 *
 * Server Actions are already CSRF-safe in Next.js 14 because the framework
 * verifies Origin + Referer headers before dispatching. We do NOT add CSRF
 * tokens to them — that would only be redundant and force every form to
 * pre-fetch a token, hurting UX.
 *
 * For `/api/*` POST routes the threat is real: a malicious page could
 * fetch('/api/auth/logout', {method:'POST', credentials:'include'}). We
 * mitigate with two checks per request:
 *
 *   1. The request carries our long-lived `csrf_token` cookie.
 *   2. The request also carries the same value in `x-csrf-token` header.
 *
 * The cookie content is `<random>.<hmac>`, signed with the session secret.
 * An attacker can read neither (HttpOnly), and even if they could read the
 * cookie via XSS, our security posture is already lost — CSRF is solved.
 *
 * PAT (Bearer) requests are exempt: cross-origin browser code cannot set
 * Authorization headers without an explicit CORS preflight that we don't
 * answer.
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

const COOKIE = "csrf_token";

function secret(): string {
  return process.env.AGENTFLOW_SESSION_SECRET || process.env.AGENTFLOW_PASSWORD || "agent-flow-default-csrf-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 22);
}

/** Mint a fresh token to set on the response cookie. */
export function issueToken(): string {
  const random = randomBytes(18).toString("base64url");
  return `${random}.${sign(random)}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (expected.length !== sig.length) return false;
  // Constant-time-ish compare.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/**
 * Inspect a request for CSRF safety. Allowed shapes:
 *   - Authorization: Bearer ... (PAT path, no cookies expected)
 *   - cookie `csrf_token` matches header `x-csrf-token` AND signature is valid
 *
 * Returns an error string ready to send back in JSON, or null when safe.
 */
export function checkCsrf(req: Request): string | null {
  // PAT bypass.
  if ((req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ")) return null;

  const cookieRaw = req.headers.get("cookie") ?? "";
  const cookieToken = readCookie(cookieRaw, COOKIE);
  const headerToken = req.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return "missing CSRF token";
  if (cookieToken !== headerToken) return "CSRF cookie/header mismatch";
  if (!verifyToken(cookieToken)) return "CSRF token invalid";
  return null;
}

function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(/;\s*/);
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    if (p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

export const CSRF_COOKIE_NAME = COOKIE;

/** SHA-256 hex helper reused by sibling modules (PAT etc.) so we don't import node:crypto twice. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
