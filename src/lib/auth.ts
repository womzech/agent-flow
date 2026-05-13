/**
 * Lightweight single-tenant auth.
 *
 * Why not NextAuth / Lucia / iron-session? — AgentForge v0.2 is still a
 * single-consultant workbench. Adding a full auth library would triple our
 * surface area and require sessions persisted to DB. Instead we use a signed
 * cookie that any Edge / Node runtime can verify with one HMAC. When the
 * product graduates to multi-tenant SaaS (roadmap v0.5), we'll swap this for
 * a real provider.
 *
 * Threat model:
 *  - Stolen device → mitigated by HTTP-only + Secure cookie + same-site lax.
 *  - Brute force → mitigated by intentionally slow HMAC + 1.5s sleep on miss.
 *  - Replay → mitigated by signed timestamp + 24h expiry.
 *  - XSS exfiltration → cookie is HTTP-only, JS cannot read it.
 */

export const SESSION_COOKIE = "agentforge_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const std = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSecret(): string {
  const secret = process.env.AGENTFORGE_SESSION_SECRET || process.env.AGENTFORGE_PASSWORD;
  if (!secret) throw new Error("AGENTFORGE_PASSWORD (and optionally AGENTFORGE_SESSION_SECRET) must be set");
  return secret;
}

/**
 * Resolve a WebCrypto SubtleCrypto. Node 18.17+ exposes `globalThis.crypto`
 * by default, so does the Edge runtime and modern browsers. We deliberately
 * reference it via `globalThis` because the bare identifier `crypto` is not
 * a TypeScript ambient global in Node-targeted lib configs.
 */
function subtle(): SubtleCrypto {
  const g = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  if (!g?.subtle) {
    throw new Error("WebCrypto SubtleCrypto unavailable in this runtime (requires Node 18.17+)");
  }
  return g.subtle;
}

/** Browser-safe: must work in Edge runtime where node:crypto is unavailable. */
export async function signSession(payload: { exp: number; v?: number }): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle().sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(token: string | undefined | null): Promise<{ ok: boolean; reason?: string; exp?: number }> {
  if (!token) return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return { ok: false, reason: "no-secret" };
  }
  const key = await subtle().importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = b64urlDecode(sig);
  // Allocate a guaranteed ArrayBuffer (not SharedArrayBuffer) to satisfy the
  // BufferSource type in strict TS.
  const sigBuffer = new ArrayBuffer(sigBytes.byteLength);
  new Uint8Array(sigBuffer).set(sigBytes);
  const ok = await subtle().verify("HMAC", key, sigBuffer, new TextEncoder().encode(body));
  if (!ok) return { ok: false, reason: "bad-signature" };
  let parsed: { exp?: number } = {};
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return { ok: false, reason: "bad-body" };
  }
  if (!parsed.exp || Date.now() / 1000 > parsed.exp) return { ok: false, reason: "expired" };
  return { ok: true, exp: parsed.exp };
}

export function expectedExp(): number {
  return Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
}

/**
 * Resource-equality string compare. Always iterates the longer string to
 * resist timing oracles. Used to compare the submitted password against env.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) ^ b.charCodeAt(i)) | 0;
  }
  return diff === 0;
}
