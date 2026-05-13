/**
 * RFC 6238 TOTP (Time-based One-Time Password) for 2FA.
 *
 * - Algorithm: HMAC-SHA1 over an 8-byte big-endian time counter
 * - Time step: 30 seconds (standard)
 * - Digits: 6
 * - Window slack: ±1 step (60-second clock drift tolerance)
 *
 * Why no QR library: we display the otpauth:// URI as text and let the
 * user paste it into their authenticator app, OR copy the base32 secret
 * manually. Writing a QR encoder is its own project and would add either
 * 50 KB of code or a new npm dep.
 *
 * Test vectors: tests/totp.test.ts asserts the canonical RFC 6238 SHA-1
 * vectors so we can never silently break this.
 */

import { createHmac, randomBytes } from "node:crypto";

const DIGITS = 6;
const STEP_SECONDS = 30;
const WINDOW = 1;  // ±1 step
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface TotpParams {
  digits?: number;
  stepSeconds?: number;
  window?: number;
  now?: number;          // Unix seconds; injected for tests
}

/** Encode a binary buffer as RFC 4648 base32 (no padding stripping needed for TOTP). */
export function toBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  // Pad to length divisible by 8 to be friendly with strict parsers.
  while (out.length % 8 !== 0) out += "=";
  return out;
}

export function fromBase32(s: string): Buffer {
  // Order matters: strip whitespace first so the trailing-padding regex still
  // catches `=` chars that were buried by spaces (e.g. "ABC=== ").
  const clean = s.replace(/\s+/g, "").toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new 20-byte secret (the size SHA-1 was designed for). */
export function generateSecret(): { binary: Buffer; base32: string } {
  const binary = randomBytes(20);
  return { binary, base32: toBase32(binary) };
}

/**
 * Compute the HOTP value for a given 8-byte counter.
 * (TOTP is HOTP with counter = floor(now / step).)
 */
export function hotp(secret: Buffer, counter: bigint, digits = DIGITS): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter);
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, "0");
}

export function totp(secret: Buffer, params: TotpParams = {}): string {
  const step = params.stepSeconds ?? STEP_SECONDS;
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const counter = BigInt(Math.floor(now / step));
  return hotp(secret, counter, params.digits ?? DIGITS);
}

/**
 * Constant-time verify: accept the current step ±WINDOW for clock drift.
 * Returns true exactly when one of the windows matches; false otherwise.
 */
export function verify(secret: Buffer, code: string, params: TotpParams = {}): boolean {
  const want = code.trim();
  if (!/^\d{6}$/.test(want)) return false;
  const step = params.stepSeconds ?? STEP_SECONDS;
  const win = params.window ?? WINDOW;
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const base = BigInt(Math.floor(now / step));
  let matched = false;
  for (let i = -win; i <= win; i++) {
    const candidate = hotp(secret, base + BigInt(i), params.digits ?? DIGITS);
    // Always run a constant-time compare; never short-circuit. We OR matched.
    matched ||= constantTimeEqual(candidate, want);
  }
  return matched;
}

export function otpauthUri(opts: { email: string; secretBase32: string; issuer?: string }): string {
  const label = encodeURIComponent(`${opts.issuer ?? "AgentFlow"}:${opts.email}`);
  const params = new URLSearchParams({
    secret: opts.secretBase32.replace(/=+$/g, ""),
    issuer: opts.issuer ?? "AgentFlow",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
    algorithm: "SHA1",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
