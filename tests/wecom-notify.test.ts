import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { notifyEvent, notifyEventAsync } from "../src/lib/wecom/notify";

describe("wecom/notify: graceful no-op when not configured", () => {
  it("notifyEvent resolves without throwing when WECOM_* unset", async () => {
    delete process.env.WECOM_CORP_ID; // ensure not configured
    await assert.doesNotReject(() =>
      notifyEvent({
        kind: "lead.create",
        lead: { id: 1, company: "X", name: "Y", industry: "z", pain_points: "", source: "wechat" },
      }),
    );
  });

  it("notifyEventAsync is synchronous void", () => {
    delete process.env.WECOM_CORP_ID;
    const r = notifyEventAsync({
      kind: "lead.create",
      lead: { id: 1, company: "X", name: "Y", industry: "z", pain_points: "", source: "wechat" },
    });
    assert.equal(r, undefined);
  });
});
