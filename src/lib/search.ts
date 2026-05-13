/**
 * SQLite FTS5-backed full-text search across business entities.
 *
 * Design choices:
 *  - Virtual table `search_index(kind, ref_id, title, body)` with unicode61
 *    tokenizer (good enough for Chinese substring + ASCII). Both `kind` and
 *    `ref_id` are UNINDEXED — we use them only to join back.
 *  - Index is rebuilt lazily on first `searchAll()` call after schema upgrade
 *    so we don't pay the cost on every cold DB open. A `rebuildAll()` admin
 *    helper is also exported.
 *  - Triggers are deliberately NOT installed (would force us to maintain
 *    them across every column rename). Instead we call `index(...)` at the
 *    same call-sites that currently emit audit events — repo layer stays
 *    pure, observability stays in the route layer.
 *
 * Permissions: searchAll() takes the user's permission set and filters
 * results to kinds they can read.
 */

import { getDb } from "./db";
import type { Permission } from "./schema";

let virtualTableEnsured = false;
let indexBuilt = false;

function ensureVirtualTable() {
  if (virtualTableEnsured) return;
  const db = getDb();
  // trigram tokenizer (SQLite ≥ 3.34): every 3-codepoint window becomes a
  // token. This gives us reliable substring matching for both ASCII and CJK
  // (which unicode61 fails to split). Minimum useful query length is 3
  // codepoints, which is fine for company / 联系人 names.
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    kind UNINDEXED,
    ref_id UNINDEXED,
    title,
    body,
    tokenize = 'trigram'
  )`);
  virtualTableEnsured = true;
}

/** Test-only hook to reset memoization between cases. */
export function _resetForTest() { virtualTableEnsured = false; indexBuilt = false; }

export type SearchKind = "lead" | "client" | "diagnostic" | "project";

interface Hit {
  kind: SearchKind;
  ref_id: number;
  title: string;
  snippet: string;
  rank: number;
}

/**
 * Insert or update one row in the index. Cheaper to delete-then-insert than
 * to UPDATE because FTS5 doesn't support partial column updates.
 */
export function indexEntity(kind: SearchKind, refId: number, title: string, body: string) {
  ensureVirtualTable();
  const db = getDb();
  db.prepare(`DELETE FROM search_index WHERE kind = ? AND ref_id = ?`).run(kind, refId);
  db.prepare(`INSERT INTO search_index (kind, ref_id, title, body) VALUES (?, ?, ?, ?)`)
    .run(kind, refId, title, body);
}

export function removeEntity(kind: SearchKind, refId: number) {
  ensureVirtualTable();
  getDb().prepare(`DELETE FROM search_index WHERE kind = ? AND ref_id = ?`).run(kind, refId);
}

/**
 * Full rebuild from current rows in leads / clients / diagnostics / projects.
 * Safe to call repeatedly; truncates and refills. ~1ms per 100 rows.
 */
export function rebuildAll() {
  ensureVirtualTable();
  const db = getDb();
  const tx = db.transaction(() => {
    db.exec(`DELETE FROM search_index`);
    const insert = db.prepare(`INSERT INTO search_index (kind, ref_id, title, body) VALUES (?, ?, ?, ?)`);

    for (const row of db.prepare(`SELECT id, company, name, industry, pain_points, budget_note, next_action, contact FROM leads`).all() as { id: number; company: string; name: string; industry: string; pain_points: string; budget_note: string; next_action: string; contact: string }[]) {
      insert.run("lead", row.id, row.company, [row.name, row.industry, row.pain_points, row.budget_note, row.next_action, row.contact].filter(Boolean).join(" "));
    }
    for (const row of db.prepare(`SELECT id, company, name, industry, contact, notes FROM clients`).all() as { id: number; company: string; name: string; industry: string; contact: string; notes: string }[]) {
      insert.run("client", row.id, row.company, [row.name, row.industry, row.contact, row.notes].filter(Boolean).join(" "));
    }
    for (const row of db.prepare(`SELECT id, title, report_markdown FROM diagnostics`).all() as { id: number; title: string; report_markdown: string }[]) {
      insert.run("diagnostic", row.id, row.title, (row.report_markdown || "").slice(0, 4000));
    }
    for (const row of db.prepare(`SELECT id, name, notes FROM projects`).all() as { id: number; name: string; notes: string }[]) {
      insert.run("project", row.id, row.name, row.notes ?? "");
    }
  });
  tx();
}

/**
 * Search across all indexed kinds. `q` is a single user-entered string;
 * we pass it through FTS5 as a phrase (after escaping double quotes) so
 * unusual characters can't blow up the query.
 *
 * Permission map: read:leads → leads, read:clients → clients, ...
 */
export function searchAll(q: string, permissions: Set<Permission>, limit = 50): Hit[] {
  ensureVirtualTable();
  // Lazy: first search after process boot rebuilds the index from current data.
  // For ≤10k rows this is well under a second.
  if (!indexBuilt) {
    rebuildAll();
    indexBuilt = true;
  }
  if (q.trim().length === 0) return [];
  const escaped = `"${q.replace(/"/g, '""')}"`;

  const kinds: SearchKind[] = [];
  if (permissions.has("read:leads")) kinds.push("lead");
  if (permissions.has("read:clients")) kinds.push("client");
  if (permissions.has("read:diagnostics")) kinds.push("diagnostic");
  if (permissions.has("read:projects")) kinds.push("project");
  if (kinds.length === 0) return [];

  const placeholders = kinds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT kind, ref_id, title, snippet(search_index, 3, '<mark>', '</mark>', '...', 12) AS snippet, rank
       FROM search_index
       WHERE search_index MATCH ? AND kind IN (${placeholders})
       ORDER BY rank LIMIT ?`,
    )
    .all(escaped, ...kinds, limit) as Hit[];
  return rows;
}
