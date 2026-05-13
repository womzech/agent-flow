import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("wecom/intent: slash command dispatch", () => {
  let dispatchIntent: typeof import("../src/lib/wecom/intent").dispatchIntent;
  let resolveSender: typeof import("../src/lib/wecom/intent").resolveSender;
  let leadsRepo: typeof import("../src/lib/repo").leadsRepo;
  let rolesRepo: typeof import("../src/lib/repo").rolesRepo;
  let usersRepo: typeof import("../src/lib/repo").usersRepo;
  let getDbReady: typeof import("../src/lib/db").getDbReady;
  let hashPassword: typeof import("../src/lib/password").hashPassword;

  before(async () => {
    // Bootstrap permissions/roles
    const dbMod = await import("../src/lib/db");
    getDbReady = dbMod.getDbReady;
    await getDbReady();
    const m = await import("../src/lib/wecom/intent");
    dispatchIntent = m.dispatchIntent;
    resolveSender = m.resolveSender;
    const repo = await import("../src/lib/repo");
    leadsRepo = repo.leadsRepo;
    rolesRepo = repo.rolesRepo;
    usersRepo = repo.usersRepo;
    const pw = await import("../src/lib/password");
    hashPassword = pw.hashPassword;
  });

  after(() => tmp.dispose());

  function buildMsg(content: string, fromUserid = "zhangsan") {
    return {
      toUserName: "wxcorp",
      fromUserName: fromUserid,
      createTime: 0,
      msgType: "text" as const,
      msgId: "1",
      agentId: 1,
      content,
      raw: {},
    };
  }

  it("/help works for unbound users", async () => {
    const r = await dispatchIntent(buildMsg("/help"));
    assert.equal(r.command, "help");
    assert.equal(r.reply.includes("AgentFlow"), true);
  });

  it("/me reports unbound state when wecom_userid has no user row", async () => {
    const r = await dispatchIntent(buildMsg("/me", "ghostuser"));
    assert.equal(r.command, "me");
    assert.equal(r.reply.includes("未绑定"), true);
  });

  it("/pipeline rejects unbound users with a friendly message", async () => {
    await assert.rejects(() => dispatchIntent(buildMsg("/pipeline", "ghostuser")), /尚未绑定/);
  });

  it("/pipeline replies for a bound user with read:leads", async () => {
    // Seed a user with wecom_userid = "zhangsan" and role = owner.
    const owner = rolesRepo.getByName("owner")!;
    const pw = await hashPassword("test-password-123");
    usersRepo.create({
      email: "zhang@test.com", name: "Zhang", wecom_userid: "zhangsan", role_id: owner.id, ...pw,
    });
    leadsRepo.create({
      name: "Test", company: "Test Co", industry: "test", contact: "x", source: "wechat",
      stage: "diagnosing", pain_points: "", budget_note: "", next_action: "",
    });
    const r = await dispatchIntent(buildMsg("/pipeline", "zhangsan"));
    assert.equal(r.command, "pipeline");
    assert.equal(r.reply.includes("销售管道"), true);
    assert.equal(r.reply.includes("**1**"), true);  // we inserted 1 lead in diagnosing
  });

  it("unknown slash command shows help", async () => {
    const r = await dispatchIntent(buildMsg("/wat"));
    assert.equal(r.command, "unknown");
    assert.equal(r.reply.includes("未识别"), true);
  });

  it("resolveSender hydrates permissions for bound user", async () => {
    const ctx = resolveSender("zhangsan");
    assert.ok(ctx.user);
    assert.equal(ctx.user?.email, "zhang@test.com");
    assert.equal(ctx.permissions.has("read:leads"), true);
    assert.equal(ctx.permissions.has("write:users"), true, "owner should have user mgmt");
  });

  it("resolveSender returns null user for unbound userid", () => {
    const ctx = resolveSender("ghostuser");
    assert.equal(ctx.user, null);
    assert.equal(ctx.permissions.size, 0);
  });
});
