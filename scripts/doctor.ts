#!/usr/bin/env tsx
/**
 * Environment self-check. Exit non-zero if any REQUIRED check fails.
 * Use as `npm run doctor` locally, or as a pre-deploy gate in CI.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { getDb, appliedMigrations } from "../src/lib/db";
import { SCHEMA_VERSION } from "../src/lib/schema";

interface Check {
  name: string;
  required: boolean;
  status: "pass" | "fail" | "warn";
  detail?: string;
}

function checkNode(): Check {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) return { name: "Node >=18", required: true, status: "pass", detail: `v${process.versions.node}` };
  return { name: "Node >=18", required: true, status: "fail", detail: `got v${process.versions.node}` };
}

function checkEnvFile(): Check {
  const envPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) return { name: ".env.local exists", required: true, status: "pass" };
  // Allow env vars to come from the process environment too.
  if (process.env.AGENTFLOW_PASSWORD) {
    return { name: ".env.local exists", required: true, status: "warn", detail: "missing file but AGENTFLOW_PASSWORD is set in process env" };
  }
  return { name: ".env.local exists", required: true, status: "fail", detail: "neither .env.local nor AGENTFLOW_PASSWORD in env" };
}

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

function checkRequiredEnv(env: Record<string, string>, key: string): Check {
  const v = process.env[key] || env[key];
  if (v && v.length > 0) return { name: `env ${key}`, required: true, status: "pass" };
  return { name: `env ${key}`, required: true, status: "fail" };
}

function checkOptionalEnv(env: Record<string, string>, key: string, why: string): Check {
  const v = process.env[key] || env[key];
  if (v && v.length > 0) return { name: `env ${key}`, required: false, status: "pass" };
  return { name: `env ${key}`, required: false, status: "warn", detail: why };
}

function checkDb(): Check {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return { name: "SQLite readable", required: true, status: "pass" };
  } catch (e) {
    return { name: "SQLite readable", required: true, status: "fail", detail: String(e) };
  }
}

function checkMigrations(): Check {
  try {
    const ms = appliedMigrations();
    const latest = ms.reduce((a, m) => (m.version > a ? m.version : a), 0);
    if (latest >= SCHEMA_VERSION) return { name: `migrations >= v${SCHEMA_VERSION}`, required: true, status: "pass", detail: `applied v${latest}` };
    return { name: `migrations >= v${SCHEMA_VERSION}`, required: true, status: "fail", detail: `applied v${latest}` };
  } catch (e) {
    return { name: "migrations check", required: true, status: "fail", detail: String(e) };
  }
}

async function checkPort(port: number): Promise<Check> {
  return new Promise((resolveCheck) => {
    const srv = createServer();
    srv.once("error", () => resolveCheck({ name: `port ${port} free`, required: false, status: "warn", detail: "another process is listening; run dev with a different port" }));
    srv.once("listening", () => {
      srv.close(() => resolveCheck({ name: `port ${port} free`, required: false, status: "pass" }));
    });
    srv.listen(port, "127.0.0.1");
  });
}

function fmt(c: Check): string {
  const icon = c.status === "pass" ? "✓" : c.status === "warn" ? "·" : "✗";
  const tag = c.required ? "[REQ]" : "[opt]";
  return `${icon} ${tag} ${c.name}${c.detail ? "  — " + c.detail : ""}`;
}

async function main() {
  const env = loadEnvFile();
  const checks: Check[] = [
    checkNode(),
    checkEnvFile(),
    checkRequiredEnv(env, "AGENTFLOW_PASSWORD"),
    checkOptionalEnv(env, "ANTHROPIC_API_KEY", "diagnostic generation will use offline fallback"),
    checkOptionalEnv(env, "WECOM_CORP_ID", "WeCom integration disabled"),
    checkDb(),
    checkMigrations(),
    await checkPort(Number(process.env.PORT) || 3000),
  ];
  for (const c of checks) process.stdout.write(fmt(c) + "\n");
  const failedRequired = checks.some((c) => c.required && c.status === "fail");
  if (failedRequired) {
    process.stderr.write("\nDoctor reports failing required checks. Fix the ✗ entries above.\n");
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`doctor failed: ${err}\n`);
    process.exit(1);
  });
}
