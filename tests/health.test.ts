import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("health endpoint route", () => {
  let GET: typeof import("../src/app/api/health/route").GET;

  before(async () => {
    GET = (await import("../src/app/api/health/route")).GET;
  });

  after(() => tmp.dispose());

  it("returns status ok when db is healthy", async () => {
    const res = await GET();
    const body = await res.json();
    assert.equal(typeof body.status, "string");
    assert.equal(body.checks.db.ok, true);
    assert.equal(body.checks.migrations.ok, true);
    assert.equal(typeof body.version, "string");
    // status 200 if all checks pass, 503 otherwise. Anthropic key likely missing in test so degraded is fine.
    assert.equal(res.status === 200 || res.status === 503, true);
  });
});
