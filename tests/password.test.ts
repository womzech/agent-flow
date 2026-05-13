import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password";

describe("password hashing", () => {
  it("rejects passwords shorter than 6 chars", async () => {
    await assert.rejects(() => hashPassword("12345"), /at least 6 characters/);
  });

  it("round trip: correct password verifies", async () => {
    const rec = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", rec), true);
  });

  it("round trip: wrong password fails", async () => {
    const rec = await hashPassword("Tr0ub4dor&3");
    assert.equal(await verifyPassword("password1", rec), false);
  });

  it("two hashes of the same password use different salts", async () => {
    const a = await hashPassword("hello world");
    const b = await hashPassword("hello world");
    assert.notEqual(a.password_salt, b.password_salt);
    assert.notEqual(a.password_hash, b.password_hash);
    assert.equal(await verifyPassword("hello world", a), true);
    assert.equal(await verifyPassword("hello world", b), true);
  });

  it("records the iteration count for forward compatibility", async () => {
    const rec = await hashPassword("anything-long", 50_000);
    assert.equal(rec.password_iter, 50_000);
    assert.equal(await verifyPassword("anything-long", rec), true);
  });

  it("verifyPassword returns false on garbage record", async () => {
    assert.equal(
      await verifyPassword("anything", { password_hash: "!!", password_salt: "??", password_iter: 100 }),
      false,
    );
  });
});

// Note: current-user.ts uses `import "server-only"` which is a Next.js
// sentinel module unavailable in plain node --test. Permission semantics
// are covered indirectly by tests/wecom-intent.test.ts (resolveSender,
// requirePerm) where we exercise the real RBAC path through the DB.
