/**
 * Server-side session tracking and account lockout.
 *
 * v0.3 sessions were purely cookie-state (signed JWT-ish). v0.4 backs
 * every active cookie with a row in `sessions` so admins can revoke
 * individual sessions and users can review their own active devices.
 *
 * Why not just a JTI revocation list? Storing the full row gives us free
 * audit (when, from where, last activity) and a clean migration path to
 * per-session refresh tokens later.
 */

import { randomBytes } from "node:crypto";
import { getDb } from "./db";

export interface SessionRow {
  id: number;
  user_id: number;
  jti: string;
  ip: string;
  user_agent: string;
  last_used_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface CreateSessionInput {
  userId: number;
  ip?: string;
  userAgent?: string;
}

/** Generate a fresh JTI and persist a new session row. */
export function create(input: CreateSessionInput): SessionRow {
  const jti = randomBytes(16).toString("base64url");
  const info = getDb()
    .prepare(`INSERT INTO sessions (user_id, jti, ip, user_agent) VALUES (?, ?, ?, ?)`)
    .run(input.userId, jti, input.ip ?? "", input.userAgent ?? "");
  return getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(Number(info.lastInsertRowid)) as SessionRow;
}

export function findActiveByJti(jti: string): SessionRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM sessions WHERE jti = ? AND revoked_at IS NULL`)
    .get(jti) as SessionRow | undefined;
  return row ?? null;
}

export function touchLastUsed(jti: string): void {
  try {
    getDb().prepare(`UPDATE sessions SET last_used_at = datetime('now') WHERE jti = ?`).run(jti);
  } catch { /* best-effort */ }
}

export function listForUser(userId: number): SessionRow[] {
  return getDb()
    .prepare(`SELECT * FROM sessions WHERE user_id = ? ORDER BY last_used_at DESC`)
    .all(userId) as SessionRow[];
}

export function revoke(userId: number, sessionId: number): boolean {
  const info = getDb()
    .prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .run(sessionId, userId);
  return info.changes > 0;
}

export function revokeJti(jti: string): boolean {
  const info = getDb()
    .prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE jti = ? AND revoked_at IS NULL`)
    .run(jti);
  return info.changes > 0;
}

/* ---------- login_attempts + lockout ---------- */

export interface AttemptLookup {
  email: string;
  ip: string;
}

const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_MIN = 15;

/** Record one login attempt (success or failure). */
export function recordAttempt(input: AttemptLookup & { ok: boolean }): void {
  try {
    getDb()
      .prepare(`INSERT INTO login_attempts (email, ip, ok) VALUES (?, ?, ?)`)
      .run(input.email.toLowerCase(), input.ip, input.ok ? 1 : 0);
  } catch { /* best-effort */ }
}

/**
 * Returns true when the (email + ip) tuple has hit LOCK_THRESHOLD failures
 * inside the rolling LOCK_WINDOW_MIN minutes. A single successful login in
 * the window resets the counter (we count failures since the latest success).
 */
export function isLockedOut(input: AttemptLookup): boolean {
  const since = `-${LOCK_WINDOW_MIN} minutes`;
  const recent = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM login_attempts
       WHERE email = ? AND ip = ? AND ok = 0
         AND at > datetime('now', ?)
         AND at > COALESCE((
           SELECT MAX(at) FROM login_attempts WHERE email = ? AND ip = ? AND ok = 1
         ), '1970-01-01')`,
    )
    .get(input.email.toLowerCase(), input.ip, since, input.email.toLowerCase(), input.ip) as { c: number };
  return recent.c >= LOCK_THRESHOLD;
}

export function lockoutInfo(input: AttemptLookup): { failures: number; threshold: number; windowMin: number } {
  const since = `-${LOCK_WINDOW_MIN} minutes`;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM login_attempts
       WHERE email = ? AND ip = ? AND ok = 0 AND at > datetime('now', ?)`,
    )
    .get(input.email.toLowerCase(), input.ip, since) as { c: number };
  return { failures: row.c, threshold: LOCK_THRESHOLD, windowMin: LOCK_WINDOW_MIN };
}

export function recentAttemptsForUser(email: string, limit = 20): { ip: string; ok: number; at: string }[] {
  return getDb()
    .prepare(`SELECT ip, ok, at FROM login_attempts WHERE email = ? ORDER BY id DESC LIMIT ?`)
    .all(email.toLowerCase(), limit) as { ip: string; ok: number; at: string }[];
}
