import { NextResponse } from "next/server";
import { getDb, appliedMigrations } from "@/lib/db";
import { SCHEMA_VERSION } from "@/lib/schema";

const STARTED_AT = new Date().toISOString();
const BUILD_SHA = process.env.AGENTFORGE_BUILD_SHA || "dev";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // DB
  try {
    const row = getDb().prepare("SELECT 1 AS one").get() as { one: number };
    checks.db = { ok: row.one === 1 };
  } catch (err) {
    checks.db = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  // Migrations current?
  try {
    const ms = appliedMigrations();
    const latest = ms[ms.length - 1]?.version ?? 0;
    checks.migrations = { ok: latest === SCHEMA_VERSION, detail: `applied=${latest}, expected=${SCHEMA_VERSION}` };
  } catch (err) {
    checks.migrations = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  // Anthropic API key presence (we don't call the API in /health — that would
  // be expensive and rate-limited).
  checks.anthropic_key = { ok: !!process.env.ANTHROPIC_API_KEY, detail: process.env.ANTHROPIC_API_KEY ? "set" : "missing (fallback mode)" };

  // Auth posture
  checks.auth = { ok: !!process.env.AGENTFORGE_PASSWORD, detail: process.env.AGENTFORGE_PASSWORD ? "enabled" : "OPEN MODE (dev only)" };

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      version: "0.2.0",
      sha: BUILD_SHA,
      started_at: STARTED_AT,
      now: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  );
}
