import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { SCHEMA_SQL } from "./schema";

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
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__agentforgeDb) {
    globalForDb.__agentforgeDb = open();
  }
  return globalForDb.__agentforgeDb;
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
