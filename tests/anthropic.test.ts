import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackDiagnostic, type DiagnosticQuestionnaire } from "../src/lib/anthropic";

const Q: DiagnosticQuestionnaire = {
  company: { name: "Test Co", industry: "外贸", size: "30人" },
  workflows: [
    { name: "回复询盘", currentMinutesPerOccurrence: 20, occurrencesPerMonth: 100, headcountInvolved: 3, currentTools: ["Excel"], failureMode: "慢" },
  ],
  existingSystems: ["Excel"],
  budget: { oneTimeCents: 5000000, monthlyCents: 200000, note: "ok" },
  goals: ["faster reply"],
  riskTolerance: "medium",
  decisionMaker: "Boss",
};

describe("anthropic fallback diagnostic", () => {
  it("never throws and returns a non-empty markdown report", () => {
    const r = fallbackDiagnostic(Q);
    assert.equal(typeof r.reportMarkdown, "string");
    assert.equal(r.reportMarkdown.length > 200, true);
    assert.equal(r.modelUsed, "fallback");
  });

  it("recommends at least one template slug", () => {
    const r = fallbackDiagnostic(Q);
    assert.equal(r.recommendedTemplates.length >= 1, true);
  });

  it("produces non-zero pricing recommendations", () => {
    const r = fallbackDiagnostic(Q);
    assert.equal(r.pricingQuoteCents > 0, true);
    assert.equal(r.monthlyQuoteCents >= 0, true);
  });

  it("references customer name in the report", () => {
    const r = fallbackDiagnostic(Q);
    assert.equal(r.reportMarkdown.includes("Test Co"), true);
  });
});
