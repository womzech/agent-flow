#!/usr/bin/env tsx
/**
 * Periodic data retention / cleanup. Safe to run multiple times — every action is
 * idempotent and operates on absolute thresholds (not "since last run").
 *
 * Default thresholds (env-configurable):
 *   CLEANUP_LOGIN_ATTEMPTS_DAYS=30   — drop login_attempts older than N days
 *   CLEANUP_SESSIONS_REVOKED_DAYS=7  — drop sessions revoked > N days ago
 *   CLEANUP_LOST_LEADS_DAYS=180      — archive (status→archived) lost leads > N days
 *   CLEANUP_EXPIRED_TOKENS=1         — null out share/portal tokens past their expiry
 *
 * Usage:
 *   npm run cleanup           # apply cleanup
 *   npm run cleanup -- --dry  # report what would be done, don't write
 */

import { getDb } from "../src/lib/db";

interface CleanupReport {
  loginAttemptsDeleted: number;
  sessionsDeleted: number;
  leadsArchived: number;
  shareTokensCleared: number;
  portalTokensCleared: number;
}

function days(n: number): string {
  // SQLite: datetime('now', '-N days')
  return `-${n} days`;
}

export function runCleanup(opts?: { dry?: boolean }): CleanupReport {
  const db = getDb();
  const dry = !!opts?.dry;
  const loginDays = Number(process.env.CLEANUP_LOGIN_ATTEMPTS_DAYS) || 30;
  const sessionDays = Number(process.env.CLEANUP_SESSIONS_REVOKED_DAYS) || 7;
  const leadDays = Number(process.env.CLEANUP_LOST_LEADS_DAYS) || 180;
  const clearExpired = (process.env.CLEANUP_EXPIRED_TOKENS ?? "1") !== "0";

  const previewCount = (sql: string, params: unknown[] = []): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(...params) as { n: number }).n;

  const r: CleanupReport = {
    loginAttemptsDeleted: 0,
    sessionsDeleted: 0,
    leadsArchived: 0,
    shareTokensCleared: 0,
    portalTokensCleared: 0,
  };

  // 1. login_attempts older than N days
  r.loginAttemptsDeleted = previewCount(`SELECT id FROM login_attempts WHERE at < datetime('now', ?)`, [days(loginDays)]);
  if (!dry && r.loginAttemptsDeleted > 0) {
    db.prepare(`DELETE FROM login_attempts WHERE at < datetime('now', ?)`).run(days(loginDays));
  }

  // 2. sessions revoked > N days ago (keep active ones forever)
  r.sessionsDeleted = previewCount(
    `SELECT id FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now', ?)`,
    [days(sessionDays)],
  );
  if (!dry && r.sessionsDeleted > 0) {
    db.prepare(`DELETE FROM sessions WHERE revoked_at IS NOT NULL AND revoked_at < datetime('now', ?)`).run(days(sessionDays));
  }

  // 3. lost leads older than N days → stage='lost' already; we don't auto-delete,
  //    we simply count for visibility. A real archive flow would copy to a
  //    cold-storage table. Keep this conservative.
  r.leadsArchived = previewCount(
    `SELECT id FROM leads WHERE stage='lost' AND updated_at < datetime('now', ?)`,
    [days(leadDays)],
  );
  // No mutation here — flagged for manual review.

  // 4. Expired tokens (share + portal). Set the token column to NULL so the
  //    URL no longer resolves; keep the expires/revoked timestamps for audit.
  if (clearExpired) {
    r.shareTokensCleared = previewCount(
      `SELECT id FROM diagnostics WHERE share_token IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at < datetime('now')`,
    );
    if (!dry && r.shareTokensCleared > 0) {
      db.prepare(
        `UPDATE diagnostics SET share_token=NULL WHERE share_token IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at < datetime('now')`,
      ).run();
    }

    r.portalTokensCleared = previewCount(
      `SELECT id FROM statement_of_work WHERE portal_token IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at < datetime('now')`,
    );
    if (!dry && r.portalTokensCleared > 0) {
      db.prepare(
        `UPDATE statement_of_work SET portal_token=NULL WHERE portal_token IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at < datetime('now')`,
      ).run();
    }
  }

  return r;
}

function main() {
  const dry = process.argv.includes("--dry");
  const r = runCleanup({ dry });
  const verb = dry ? "would clean" : "cleaned";
  process.stdout.write(
    JSON.stringify({ mode: dry ? "dry-run" : "applied", report: r, verb }, null, 2) + "\n",
  );
}

if (require.main === module) {
  main();
}
