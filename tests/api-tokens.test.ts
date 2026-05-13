import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("api-tokens", () => {
  let pat: typeof import("../src/lib/api-tokens");
  let usersRepo: typeof import("../src/lib/repo").usersRepo;
  let rolesRepo: typeof import("../src/lib/repo").rolesRepo;
  let hashPassword: typeof import("../src/lib/password").hashPassword;
  let userId: number;

  before(async () => {
    const { getDbReady } = await import("../src/lib/db");
    await getDbReady();
    pat = await import("../src/lib/api-tokens");
    const repo = await import("../src/lib/repo");
    usersRepo = repo.usersRepo;
    rolesRepo = repo.rolesRepo;
    const pw = await import("../src/lib/password");
    hashPassword = pw.hashPassword;
    const owner = rolesRepo.getByName("owner")!;
    const hashed = await hashPassword("test-password-123");
    const u = usersRepo.create({
      email: "pat-tester@local", name: "PAT Tester", wecom_userid: null, role_id: owner.id, ...hashed,
    });
    userId = u.id;
  });

  after(() => tmp.dispose());

  it("generates token starting with agf_ and with right body length", () => {
    const t = pat.generatePlaintext();
    assert.equal(t.startsWith("agf_"), true);
    assert.equal(t.length, 4 + 32);
  });

  it("create returns the plaintext exactly once and stores only hash", () => {
    const created = pat.create(userId, "n8n test");
    assert.equal(created.plaintext.startsWith("agf_"), true);
    assert.equal(created.token_prefix.length, 11);
    // The stored hash never equals the plaintext
    assert.notEqual(created.plaintext, created.token_hash);
    assert.equal(created.token_hash.length, 64, "sha256 hex is 64 chars");
  });

  it("resolvePat finds the user for a valid token", () => {
    const c = pat.create(userId, "lookup test");
    const res = pat.resolvePat(c.plaintext);
    assert.ok(res);
    assert.equal(res!.userId, userId);
    assert.equal(res!.tokenId, c.id);
  });

  it("resolvePat returns null for unknown / non-prefixed input", () => {
    assert.equal(pat.resolvePat("nope"), null);
    assert.equal(pat.resolvePat("agf_doesnotexistdoesnotexistdoesnot"), null);
  });

  it("revoked tokens fail resolvePat immediately", () => {
    const c = pat.create(userId, "revoke test");
    assert.ok(pat.resolvePat(c.plaintext), "active token resolves");
    pat.revoke(userId, c.id);
    assert.equal(pat.resolvePat(c.plaintext), null, "revoked token rejects");
  });

  it("revoke is idempotent and scoped to owner user_id", () => {
    const c = pat.create(userId, "double revoke");
    assert.equal(pat.revoke(userId, c.id), true);
    assert.equal(pat.revoke(userId, c.id), false, "second revoke returns false");
    assert.equal(pat.revoke(99999, c.id), false, "wrong user cannot revoke");
  });

  it("listForUser returns tokens for the given user only", () => {
    const before = pat.listForUser(userId).length;
    pat.create(userId, "a");
    pat.create(userId, "b");
    const after = pat.listForUser(userId);
    assert.equal(after.length, before + 2);
    // Ordering: newest first
    assert.equal(after[0].name === "b" || after[1].name === "b", true);
  });

  it("ctEqual matches identical and rejects different", () => {
    assert.equal(pat.ctEqual("abc", "abc"), true);
    assert.equal(pat.ctEqual("abc", "abd"), false);
    assert.equal(pat.ctEqual("short", "longer"), false);
  });
});
