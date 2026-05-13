import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("search: SQLite FTS5 full-text search across entities", () => {
  let search: typeof import("../src/lib/search");
  let leadsRepo: typeof import("../src/lib/repo").leadsRepo;
  let clientsRepo: typeof import("../src/lib/repo").clientsRepo;

  before(async () => {
    const { getDbReady } = await import("../src/lib/db");
    await getDbReady();
    search = await import("../src/lib/search");
    const repo = await import("../src/lib/repo");
    leadsRepo = repo.leadsRepo;
    clientsRepo = repo.clientsRepo;

    leadsRepo.create({
      name: "Alice Liu", company: "深圳越达玩具", industry: "玩具外贸",
      contact: "alice@yueda.cn", source: "wechat", stage: "diagnosing",
      pain_points: "询盘响应慢", budget_note: "", next_action: "",
    });
    leadsRepo.create({
      name: "Bob Zhang", company: "杭州盛远机电", industry: "工程",
      contact: "bob@shengyuan.cn", source: "referral", stage: "lead",
      pain_points: "材料价格波动", budget_note: "", next_action: "",
    });
    clientsRepo.create({
      name: "Charlie Wang", company: "上海简素咨询", industry: "管理咨询",
      size: "10人", contact: "charlie@jiansu.consulting", billing_email: "", notes: "",
    });

    search._resetForTest();
  });

  after(() => tmp.dispose());

  it("returns hits matching company name (trigram min 3 codepoints)", () => {
    const perms = new Set(["read:leads", "read:clients", "read:diagnostics", "read:projects"] as const) as Set<import("../src/lib/schema").Permission>;
    const hits = search.searchAll("越达玩", perms);
    assert.equal(hits.length >= 1, true);
    assert.equal(hits.some((h) => h.kind === "lead" && /越达/.test(h.title)), true);
  });

  it("returns hits in the body field too (pain_points)", () => {
    const perms = new Set(["read:leads"] as const) as Set<import("../src/lib/schema").Permission>;
    const hits = search.searchAll("响应慢", perms);
    assert.equal(hits.length >= 1, true);
  });

  it("filters by permission set (no read:clients → no client hits)", () => {
    const onlyLeads = new Set(["read:leads"] as const) as Set<import("../src/lib/schema").Permission>;
    const hits = search.searchAll("简素咨", onlyLeads);
    assert.equal(hits.length, 0);

    const both = new Set(["read:leads", "read:clients"] as const) as Set<import("../src/lib/schema").Permission>;
    const hits2 = search.searchAll("简素咨", both);
    assert.equal(hits2.some((h) => h.kind === "client"), true);
  });

  it("returns [] when query is empty", () => {
    const perms = new Set(["read:leads"] as const) as Set<import("../src/lib/schema").Permission>;
    assert.deepEqual(search.searchAll("", perms), []);
    assert.deepEqual(search.searchAll("   ", perms), []);
  });

  it("returns [] when permissions empty", () => {
    const hits = search.searchAll("越达玩", new Set());
    assert.equal(hits.length, 0);
  });

  it("rebuildAll picks up newly-created entities", () => {
    const perms = new Set(["read:leads"] as const) as Set<import("../src/lib/schema").Permission>;
    leadsRepo.create({
      name: "X", company: "新公司XYZ", industry: "test",
      contact: "x@x.com", source: "wechat", stage: "lead",
      pain_points: "", budget_note: "", next_action: "",
    });
    search.rebuildAll();
    const hits = search.searchAll("XYZ", perms);
    assert.equal(hits.length >= 1, true);
  });
});
