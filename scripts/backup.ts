#!/usr/bin/env tsx
/**
 * Hot backup of the AgentFlow SQLite database. Uses the better-sqlite3 Online
 * Backup API so the live DB does not need to be quiesced. Safe to run while
 * the Next.js dev/prod process is serving requests.
 *
 * Usage:
 *   npm run backup                       # writes data/backups/agent-flow-YYYYMMDD-HHmm.db
 *   AGENTFLOW_BACKUP_DIR=/tmp npm run backup
 *
 * Retention: this script does NOT prune old backups. Wire your filesystem
 * snapshot or cron job to handle that — keeping it out of TS makes restore
 * easier and reduces blast radius.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../src/lib/db";

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function runBackup(opts?: { destDir?: string }): Promise<{ path: string; bytes: number }> {
  const destDir = resolve(process.cwd(), opts?.destDir || process.env.AGENTFLOW_BACKUP_DIR || "data/backups");
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  const outPath = resolve(destDir, `agent-flow-${timestamp()}.db`);
  const db = getDb();
  await db.backup(outPath);
  const bytes = statSync(outPath).size;
  return { path: outPath, bytes };
}

async function main() {
  const { path, bytes } = await runBackup();
  process.stdout.write(JSON.stringify({ ok: true, path, bytes }, null, 2) + "\n");
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`backup failed: ${err}\n`);
    process.exit(1);
  });
}
