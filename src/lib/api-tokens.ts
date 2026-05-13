/**
 * Personal Access Tokens for programmatic API access (n8n / Zapier / curl).
 *
 * Token format:  `agf_` + 32 random base32 chars  (total 36 chars)
 * Storage:       SHA-256 hex of the plaintext token in api_tokens.token_hash.
 *                Plaintext is never persisted; the caller MUST show it to
 *                the user exactly once at creation time.
 *
 * Auth flow:
 *   - Client sends `Authorization: Bearer agf_xxx...` to any /api/* route.
 *   - resolvePat(token) hashes + looks up + checks revoked_at.
 *   - On success, last_used_at is bumped to now() (best-effort).
 *
 * Tokens inherit all permissions of the owning user's role. Scope-narrowing
 * is out of scope for v0.4; planned for v0.5.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";

const PREFIX = "agf_";
const BODY_LEN = 32;        // base32 alphabet length
const PREFIX_VISIBLE = 11;  // "agf_xxxxxxx" — 4 + 7 chars shown in lists
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBase32(n: number): string {
  const buf = randomBytes(n);
  let s = "";
  for (const b of buf) s += BASE32[b % 32];
  return s;
}

export function generatePlaintext(): string {
  return PREFIX + randomBase32(BODY_LEN);
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface ApiToken {
  id: number;
  user_id: number;
  token_hash: string;
  token_prefix: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface CreatedToken extends ApiToken {
  /** Only present right after creation; never stored. Show ONCE. */
  plaintext: string;
}

export function listForUser(userId: number): ApiToken[] {
  return getDb()
    .prepare(`SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC, id DESC`)
    .all(userId) as ApiToken[];
}

export function create(userId: number, name: string): CreatedToken {
  const plaintext = generatePlaintext();
  const prefix = plaintext.slice(0, PREFIX_VISIBLE);
  const hash = hashToken(plaintext);
  const info = getDb()
    .prepare(`INSERT INTO api_tokens (user_id, token_hash, token_prefix, name) VALUES (?, ?, ?, ?)`)
    .run(userId, hash, prefix, name);
  const row = getDb().prepare(`SELECT * FROM api_tokens WHERE id = ?`).get(Number(info.lastInsertRowid)) as ApiToken;
  return { ...row, plaintext };
}

export function revoke(userId: number, tokenId: number): boolean {
  const info = getDb()
    .prepare(`UPDATE api_tokens SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .run(tokenId, userId);
  return info.changes > 0;
}

/**
 * Look up a PAT by its plaintext value. Returns the owning user_id when the
 * token is known and not revoked, otherwise null. Updates last_used_at on hit.
 */
export function resolvePat(plaintext: string): { userId: number; tokenId: number } | null {
  if (!plaintext.startsWith(PREFIX)) return null;
  const hash = hashToken(plaintext);
  const row = getDb()
    .prepare(`SELECT id, user_id, revoked_at FROM api_tokens WHERE token_hash = ?`)
    .get(hash) as { id: number; user_id: number; revoked_at: string | null } | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  // Best-effort timestamp update; failure shouldn't block auth.
  try {
    getDb().prepare(`UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  } catch {
    /* ignore */
  }
  return { userId: row.user_id, tokenId: row.id };
}

/**
 * Constant-time string equality. Exported for callers (login flow uses it
 * too, but they already have node:crypto.timingSafeEqual via password.ts).
 */
export function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return timingSafeEqual(ab, bb);
}
