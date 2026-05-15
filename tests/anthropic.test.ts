import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fallbackDiagnostic, type DiagnosticQuestionnaire, generateDiagnostic } from "../src/lib/anthropic";

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

describe("anthropic.generateDiagnostic — caching + retry", () => {
  afterEach(() => mock.restoreAll());

  it("passes cache_control on system blocks and parses recommendedTemplates", async () => {
    let captured: Record<string, unknown> | undefined;
    const fakeResp = {
      content: [
        {
          type: "text",
          text:
            "# AI 工作流诊断报告\n\n报告正文...\n\n```json\n" +
            JSON.stringify({ recommendedTemplates: ["lead-intake"], pricingQuoteCents: 3000000, monthlyQuoteCents: 200000 }) +
            "\n```\n",
        },
      ],
      usage: { input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 },
    };
    const ant = await import("../src/lib/anthropic");
    ant.__setClientForTest({
      messages: { create: async (args: Record<string, unknown>) => { captured = args; return fakeResp; } },
    });
    try {
      const r = await generateDiagnostic(Q);
      assert.equal(r.modelUsed.length > 0, true);
      assert.equal(r.recommendedTemplates[0], "lead-intake");
      assert.equal(r.pricingQuoteCents, 3000000);
      assert.equal(Array.isArray(captured?.system), true);
      const sys = captured?.system as { cache_control?: { type: string } }[];
      assert.equal(sys[0].cache_control?.type, "ephemeral");
      assert.equal(sys[1].cache_control?.type, "ephemeral");
    } finally {
      ant.__setClientForTest(null);
    }
  });

  it("retries on retriable (5xx) error and eventually succeeds", async () => {
    let calls = 0;
    const fakeResp = {
      content: [{ type: "text", text: "# 报告\n\n正文\n\n```json\n{\"recommendedTemplates\":[],\"pricingQuoteCents\":0,\"monthlyQuoteCents\":0}\n```\n" }],
      usage: {},
    };
    const ant = await import("../src/lib/anthropic");
    ant.__setClientForTest({
      messages: {
        create: async () => {
          calls += 1;
          if (calls < 2) {
            const err = Object.assign(new Error("upstream 503"), { status: 503 });
            throw err;
          }
          return fakeResp;
        },
      },
    });
    process.env.ANTHROPIC_MAX_ATTEMPTS = "3";
    try {
      await generateDiagnostic(Q);
      assert.equal(calls, 2);
    } finally {
      ant.__setClientForTest(null);
    }
  });
});
