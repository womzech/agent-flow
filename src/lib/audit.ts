import { getDb } from "./db";
import type { AuditAction } from "./schema";

export interface AuditEvent {
  id: number;
  actor: string;
  action: AuditAction;
  entity: string;
  entity_id: number | null;
  payload_json: string;
  at: string;
}

export interface RecordOpts {
  actor?: string;
  action: AuditAction;
  entity: string;
  entityId?: number | null;
  payload?: Record<string, unknown>;
}

/**
 * Append-only audit record. Designed to never throw — audit failures must
 * never block the user-facing action. Errors are logged to stderr instead.
 */
export function record(opts: RecordOpts): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (actor, action, entity, entity_id, payload_json) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        opts.actor || "consultant",
        opts.action,
        opts.entity,
        opts.entityId ?? null,
        JSON.stringify(opts.payload ?? {}),
      );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to record event", { opts, err });
  }
}

export interface ListFilter {
  entity?: string;
  entityId?: number;
  action?: AuditAction;
  limit?: number;
}

export function list(filter: ListFilter = {}): AuditEvent[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.entity) { conditions.push("entity = ?"); params.push(filter.entity); }
  if (filter.entityId != null) { conditions.push("entity_id = ?"); params.push(filter.entityId); }
  if (filter.action) { conditions.push("action = ?"); params.push(filter.action); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(1000, filter.limit ?? 200));
  return getDb()
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit) as AuditEvent[];
}

export function countAll(): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS c FROM audit_log`).get() as { c: number };
  return row.c;
}
