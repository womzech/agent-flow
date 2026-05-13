import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("sessions: server-side session tracking", () => {
  let sess: typeof import("../src/lib/sessions");
  let usersRepo: typeof import("../src/lib/repo").usersRepo;
  let userId: number;

  before(async () => {
    const { getDbReady } = await import("../src/lib/db");
    await getDbReady();
    sess = await import("../src/lib/sessions");
    const repo = await import("../src/lib/repo");
    usersRepo = repo.usersRepo;
    const { hashPassword } = await import("../src/lib/password");
    const roles = (await import("../src/lib/repo")).rolesRepo;
    const owner = roles.getByName("owner")!;
    const hashed = await hashPassword("test-password-123");
    const u = usersRepo.create({
      email: "session-test@local", name: "Sess Test", wecom_userid: null, role_id: owner.id, ...hashed,
    });
    userId = u.id;
  });

  after(() => tmp.dispose());

  it("create + findActiveByJti round trip", () => {
    const s = sess.create({ userId, ip: "1.2.3.4", userAgent: "ua-test" });
    assert.ok(s.jti);
    assert.equal(s.user_id, userId);
    assert.equal(s.ip, "1.2.3.4");
    const found = sess.findActiveByJti(s.jti);
    assert.ok(found);
    assert.equal(found!.id, s.id);
  });

  it("revoked session not returned by findActiveByJti", () => {
    const s = sess.create({ userId });
    sess.revoke(userId, s.id);
    assert.equal(sess.findActiveByJti(s.jti), null);
  });

  it("revokeJti works", () => {
    const s = sess.create({ userId });
    assert.equal(sess.revokeJti(s.jti), true);
    assert.equal(sess.revokeJti(s.jti), false, "second revoke is no-op");
  });

  it("touchLastUsed updates timestamp", () => {
    const s = sess.create({ userId });
    sess.touchLastUsed(s.jti);
    const refreshed = sess.findActiveByJti(s.jti);
    assert.ok(refreshed);
    assert.equal(typeof refreshed!.last_used_at, "string");
  });
});

describe("sessions: lockout via login_attempts", () => {
  let sess: typeof import("../src/lib/sessions");

  before(async () => {
    sess = await import("../src/lib/sessions");
  });

  it("not locked out before threshold", () => {
    for (let i = 0; i < 4; i++) sess.recordAttempt({ email: "lock@x.com", ip: "9.9.9.9", ok: false });
    assert.equal(sess.isLockedOut({ email: "lock@x.com", ip: "9.9.9.9" }), false);
  });

  it("locked out at threshold (5 failures)", () => {
    sess.recordAttempt({ email: "lock@x.com", ip: "9.9.9.9", ok: false });
    assert.equal(sess.isLockedOut({ email: "lock@x.com", ip: "9.9.9.9" }), true);
    const info = sess.lockoutInfo({ email: "lock@x.com", ip: "9.9.9.9" });
    assert.equal(info.threshold, 5);
    assert.equal(info.failures >= 5, true);
  });

  it("a successful login resets the counter", () => {
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: false });
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: false });
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: false });
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: true });
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: false });
    sess.recordAttempt({ email: "reset@x.com", ip: "1.1.1.1", ok: false });
    assert.equal(sess.isLockedOut({ email: "reset@x.com", ip: "1.1.1.1" }), false, "only 2 failures after success");
  });

  it("different IPs are independent", () => {
    for (let i = 0; i < 5; i++) sess.recordAttempt({ email: "user@x.com", ip: "1.0.0.1", ok: false });
    assert.equal(sess.isLockedOut({ email: "user@x.com", ip: "1.0.0.1" }), true);
    assert.equal(sess.isLockedOut({ email: "user@x.com", ip: "2.0.0.1" }), false);
  });
});
