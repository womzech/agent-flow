import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("schema migrations", () => {
  let appliedMigrations: typeof import("../src/lib/db").appliedMigrations;
  let SCHEMA_VERSION: number;

  before(async () => {
    const db = await import("../src/lib/db");
    const schema = await import("../src/lib/schema");
    appliedMigrations = db.appliedMigrations;
    SCHEMA_VERSION = schema.SCHEMA_VERSION;
    db.getDb(); // force open
  });

  after(() => tmp.dispose());

  it("records the current schema version", () => {
    const rows = appliedMigrations();
    assert.equal(rows.length >= 1, true, "expected at least one migration row");
    assert.equal(rows[rows.length - 1].version, SCHEMA_VERSION);
  });

  it("creates all tables", async () => {
    const { getDb } = await import("../src/lib/db");
    const rows = getDb().prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const t of ["leads", "clients", "diagnostics", "projects", "blueprints", "deliverables", "tickets", "revenue_log", "settings", "schema_migrations", "audit_log"]) {
      assert.equal(names.includes(t), true, `missing table: ${t}`);
    }
  });

  it("creates expected indexes", async () => {
    const { getDb } = await import("../src/lib/db");
    const rows = getDb().prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all() as { name: string }[];
    const idx = rows.map((r) => r.name);
    for (const i of ["idx_leads_stage", "idx_audit_log_at", "idx_projects_status", "idx_tickets_proj_status"]) {
      assert.equal(idx.includes(i), true, `missing index: ${i}`);
    }
  });
});
