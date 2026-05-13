import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("repo layer", () => {
  let repo: typeof import("../src/lib/repo");

  before(async () => {
    repo = await import("../src/lib/repo");
  });

  after(() => tmp.dispose());

  it("creates and retrieves a lead", () => {
    const created = repo.leadsRepo.create({
      name: "Alice", company: "Acme", industry: "外贸",
      contact: "a@a.com", source: "wechat", stage: "lead",
      pain_points: "邮件回复慢", budget_note: "", next_action: "",
    });
    assert.equal(created.name, "Alice");
    assert.equal(created.stage, "lead");
    const fetched = repo.leadsRepo.get(created.id);
    assert.equal(fetched?.company, "Acme");
  });

  it("updates lead stage", () => {
    const l = repo.leadsRepo.create({
      name: "Bob", company: "Beta", industry: "工程",
      contact: "b@b.com", source: "referral", stage: "lead",
      pain_points: "", budget_note: "", next_action: "",
    });
    const updated = repo.leadsRepo.update(l.id, { stage: "contacted" });
    assert.equal(updated?.stage, "contacted");
  });

  it("counts leads by stage", () => {
    const counts = repo.leadsRepo.countByStage();
    assert.equal(typeof counts.lead, "number");
    assert.equal(typeof counts.contacted, "number");
  });

  it("creates a diagnostic with questionnaire JSON", () => {
    const d = repo.diagnosticsRepo.create({
      title: "Test Diag",
      questionnaire: { company: { name: "Test" }, workflows: [] },
    });
    assert.equal(d.title, "Test Diag");
    const parsed = repo.diagnosticsRepo.parseQuestionnaire(d) as { company: { name: string } };
    assert.equal(parsed.company.name, "Test");
  });

  it("generates a unique share token", () => {
    const d = repo.diagnosticsRepo.create({ title: "Share Test", questionnaire: {} });
    const token1 = repo.diagnosticsRepo.ensureShareToken(d.id);
    const token2 = repo.diagnosticsRepo.ensureShareToken(d.id);
    assert.equal(token1, token2, "ensureShareToken should be idempotent");
    assert.equal(token1.length > 20, true);
    const found = repo.diagnosticsRepo.getByShareToken(token1);
    assert.equal(found?.id, d.id);
  });

  it("records revenue and aggregates by month", () => {
    const rowId = repo.revenueRepo.add({ kind: "diagnostic", amount_cents: 500000, memo: "Test" });
    assert.equal(typeof rowId, "number");
    const total = repo.revenueRepo.monthTotalCents(new Date().toISOString().slice(0, 7));
    assert.equal(total >= 500000, true);
  });

  it("opens and closes tickets", () => {
    const t = repo.ticketsRepo.create({ title: "Bug", priority: "high" });
    assert.equal(t.status, "open");
    repo.ticketsRepo.setStatus(t.id, "resolved");
    const refreshed = repo.ticketsRepo.list().find((x) => x.id === t.id);
    assert.equal(refreshed?.status, "resolved");
    assert.equal(typeof refreshed?.closed_at, "string");
  });

  it("settings round-trip", () => {
    repo.settingsRepo.set("test_key", "v1");
    assert.equal(repo.settingsRepo.get("test_key"), "v1");
    repo.settingsRepo.set("test_key", "v2");
    assert.equal(repo.settingsRepo.get("test_key"), "v2");
  });
});
