import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("audit log", () => {
  let audit: typeof import("../src/lib/audit");

  before(async () => {
    audit = await import("../src/lib/audit");
  });

  after(() => tmp.dispose());

  it("records and lists events", () => {
    audit.record({ action: "lead.create", entity: "lead", entityId: 1, payload: { name: "X" } });
    audit.record({ action: "lead.update", entity: "lead", entityId: 1, payload: { stage: "contacted" } });
    const events = audit.list({ entity: "lead", entityId: 1 });
    assert.equal(events.length, 2);
    // Most recent first
    assert.equal(events[0].action, "lead.update");
  });

  it("filters by entity", () => {
    audit.record({ action: "project.create", entity: "project", entityId: 99 });
    const projects = audit.list({ entity: "project" });
    assert.equal(projects.every((e) => e.entity === "project"), true);
  });

  it("counts total", () => {
    const c = audit.countAll();
    assert.equal(c >= 3, true);
  });

  it("never throws on payload that can be stringified", () => {
    audit.record({ action: "auth.login", entity: "session", payload: { ip: "127.0.0.1" } });
    audit.record({ action: "auth.fail", entity: "session" });
    const auths = audit.list({ entity: "session" });
    assert.equal(auths.length >= 2, true);
  });
});
