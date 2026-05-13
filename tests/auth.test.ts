import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

const originalPassword = process.env.AGENTFORGE_PASSWORD;
const originalSecret = process.env.AGENTFORGE_SESSION_SECRET;

describe("auth", () => {
  before(() => {
    process.env.AGENTFORGE_PASSWORD = "test-password";
    delete process.env.AGENTFORGE_SESSION_SECRET;
  });
  after(() => {
    if (originalPassword !== undefined) process.env.AGENTFORGE_PASSWORD = originalPassword;
    else delete process.env.AGENTFORGE_PASSWORD;
    if (originalSecret !== undefined) process.env.AGENTFORGE_SESSION_SECRET = originalSecret;
  });

  it("signs and verifies a valid session", async () => {
    const auth = await import("../src/lib/auth");
    const token = await auth.signSession({ exp: auth.expectedExp() });
    const verdict = await auth.verifySession(token);
    assert.equal(verdict.ok, true);
  });

  it("rejects an expired session", async () => {
    const auth = await import("../src/lib/auth");
    const token = await auth.signSession({ exp: Math.floor(Date.now() / 1000) - 60 });
    const verdict = await auth.verifySession(token);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "expired");
  });

  it("rejects a tampered signature", async () => {
    const auth = await import("../src/lib/auth");
    const token = await auth.signSession({ exp: auth.expectedExp() });
    const tampered = token.slice(0, -2) + "XX";
    const verdict = await auth.verifySession(tampered);
    assert.equal(verdict.ok, false);
  });

  it("rejects missing token", async () => {
    const auth = await import("../src/lib/auth");
    const verdict = await auth.verifySession(undefined);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, "missing");
  });

  it("rejects malformed token", async () => {
    const auth = await import("../src/lib/auth");
    const verdict = await auth.verifySession("not.valid.format.too.many.dots");
    assert.equal(verdict.ok, false);
  });

  it("constantTimeEqual matches identical strings", async () => {
    const auth = await import("../src/lib/auth");
    assert.equal(auth.constantTimeEqual("hello", "hello"), true);
    assert.equal(auth.constantTimeEqual("a", "b"), false);
    assert.equal(auth.constantTimeEqual("short", "longer"), false);
  });
});
