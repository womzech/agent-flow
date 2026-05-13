import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const originalSecret = process.env.AGENTFLOW_SESSION_SECRET;
const originalPassword = process.env.AGENTFLOW_PASSWORD;

describe("csrf token issue/verify round trip", () => {
  before(() => {
    process.env.AGENTFLOW_SESSION_SECRET = "test-csrf-secret-do-not-use";
    delete process.env.AGENTFLOW_PASSWORD;
  });
  after(() => {
    if (originalSecret !== undefined) process.env.AGENTFLOW_SESSION_SECRET = originalSecret;
    else delete process.env.AGENTFLOW_SESSION_SECRET;
    if (originalPassword !== undefined) process.env.AGENTFLOW_PASSWORD = originalPassword;
  });

  it("issueToken produces a valid `payload.sig` shape", async () => {
    const { issueToken, verifyToken } = await import("../src/lib/csrf");
    const t = issueToken();
    assert.equal(t.includes("."), true);
    assert.equal(verifyToken(t), true);
  });

  it("verifyToken rejects garbage", async () => {
    const { verifyToken } = await import("../src/lib/csrf");
    assert.equal(verifyToken(""), false);
    assert.equal(verifyToken(undefined), false);
    assert.equal(verifyToken("nodothere"), false);
    assert.equal(verifyToken("payload.badsig"), false);
  });

  it("verifyToken rejects tampered payload", async () => {
    const { issueToken, verifyToken } = await import("../src/lib/csrf");
    const t = issueToken();
    const tampered = t.slice(0, 5) + "X" + t.slice(6);
    assert.equal(verifyToken(tampered), false);
  });
});

describe("csrf: checkCsrf request inspection", () => {
  before(() => { process.env.AGENTFLOW_SESSION_SECRET = "test-csrf-secret-do-not-use"; });

  it("rejects when neither header nor cookie present", async () => {
    const { checkCsrf } = await import("../src/lib/csrf");
    const req = new Request("http://x/api/test", { method: "POST" });
    assert.equal(typeof checkCsrf(req), "string");
  });

  it("accepts when cookie + header match a valid token", async () => {
    const { issueToken, checkCsrf } = await import("../src/lib/csrf");
    const t = issueToken();
    const req = new Request("http://x/api/test", {
      method: "POST",
      headers: { cookie: `csrf_token=${t}`, "x-csrf-token": t },
    });
    assert.equal(checkCsrf(req), null);
  });

  it("rejects when cookie and header disagree", async () => {
    const { issueToken, checkCsrf } = await import("../src/lib/csrf");
    const a = issueToken();
    const b = issueToken();
    const req = new Request("http://x/api/test", {
      method: "POST",
      headers: { cookie: `csrf_token=${a}`, "x-csrf-token": b },
    });
    assert.equal(typeof checkCsrf(req), "string");
  });

  it("bypasses CSRF when Authorization: Bearer present (PAT path)", async () => {
    const { checkCsrf } = await import("../src/lib/csrf");
    const req = new Request("http://x/api/test", {
      method: "POST",
      headers: { authorization: "Bearer agf_dummy" },
    });
    assert.equal(checkCsrf(req), null);
  });
});
