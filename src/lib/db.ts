import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

const DB_PATH = process.env.AGENTFORGE_DB
  ? resolve(process.cwd(), process.env.AGENTFORGE_DB)
  : resolve(process.cwd(), "data/agentforge.db");

// Cache the DB on globalThis so Next.js hot reloads don't open dozens of handles.
const globalForDb = globalThis as unknown as { __agentforgeDb?: Database.Database };

function open() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  recordMigration(db, SCHEMA_VERSION);
  return db;
}

function recordMigration(db: Database.Database, version: number) {
  // schema_migrations exists because SCHEMA_SQL just created it (IF NOT EXISTS).
  db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)`).run(version);
}

export function appliedMigrations(): { version: number; applied_at: string }[] {
  return getDb().prepare(`SELECT version, applied_at FROM schema_migrations ORDER BY version`).all() as { version: number; applied_at: string }[];
}

export function getDb(): Database.Database {
  if (!globalForDb.__agentforgeDb) {
    globalForDb.__agentforgeDb = open();
    // Fire-and-forget RBAC bootstrap. We deliberately don't await here so
    // tests / non-RBAC code paths don't pay the password-hashing latency
    // (~100ms) on first call. `ensureBootstrapped()` is idempotent.
    import("./bootstrap")
      .then((m) => m.ensureBootstrapped())
      .catch((err) => console.error("[db] bootstrap deferred error", err));
  }
  return globalForDb.__agentforgeDb;
}

/**
 * Synchronous variant for code paths (login, /users page, tests) that need
 * the admin user seeded BEFORE they read the users table. Awaiting this
 * once at request start is fine; later calls are no-ops.
 */
export async function getDbReady(): Promise<Database.Database> {
  const db = getDb();
  const { ensureBootstrapped } = await import("./bootstrap");
  await ensureBootstrapped();
  return db;
}

export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const tx = db.transaction(fn);
  return tx(db);
}

export function closeDb() {
  if (globalForDb.__agentforgeDb) {
    globalForDb.__agentforgeDb.close();
    globalForDb.__agentforgeDb = undefined;
  }
}
