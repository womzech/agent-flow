/**
 * Shared test setup: gives every test file a fresh, isolated SQLite DB.
 * Tests don't share state because each file is run in its own Node process
 * by `node --test`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir: string | null = null;

export function withTempDb(): { dispose: () => void } {
  tmpDir = mkdtempSync(join(tmpdir(), "agent-flow-test-"));
  process.env.AGENTFLOW_DB = join(tmpDir, "test.db");
  return {
    dispose() {
      try {
        if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
      tmpDir = null;
    },
  };
}
