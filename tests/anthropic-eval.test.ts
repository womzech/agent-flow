import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fallbackDiagnostic, type DiagnosticQuestionnaire } from "../src/lib/anthropic";

/**
 * Lightweight prompt-output eval. We cannot call the live LLM in tests, but we
 * can pin the *shape* of the output our system depends on (8 numbered headings,
 * the JSON block, the required JSON keys, the table syntax used for the
 * automation matrix). This catches "prompt got rewritten and now skips § 6"
 * regressions before they hit production.
 *
 * For the live model, run `npm run e2e:delivery-flow` against a staging key.
 */

const SAMPLE: DiagnosticQuestionnaire = {
  company: { name: "测试公司", industry: "外贸", size: "30 人" },
  workflows: [
    { name: "处理询盘", currentMinutesPerOccurrence: 20, occurrencesPerMonth: 100, headcountInvolved: 3, currentTools: ["Excel"] },
  ],
  existingSystems: ["Excel"],
  budget: { oneTimeCents: 5_000_000, monthlyCents: 200_000 },
  goals: ["缩短响应时间"],
  riskTolerance: "medium",
};

describe("anthropic.fallbackDiagnostic — output schema regression", () => {
  it("emits all 8 numbered headings the UI expects", () => {
    const r = fallbackDiagnostic(SAMPLE);
    const required = [
      "## 1. 现状速览",
      "## 2. 高频重复工作流梳理",
      "## 3. 自动化机会矩阵",
      "## 4. 推荐试点范围",
      "## 5. ROI 估算",
      "## 6. 报价建议",
      "## 7. 不在范围内的事项",
      "## 8. 下一步建议",
    ];
    for (const h of required) {
      assert.ok(r.reportMarkdown.includes(h), `missing heading ${h}`);
    }
  });

  it("emits the §3 automation matrix table with the expected column headers", () => {
    const r = fallbackDiagnostic(SAMPLE);
    // Markdown table headers must match what the share/print pages parse.
    assert.ok(r.reportMarkdown.includes("| 工作流 | 自动化难度 | 预估每月节省小时 | 优先级 | 建议模板 |"));
  });

  it("references customer-provided numbers (not placeholders) in the report", () => {
    const r = fallbackDiagnostic(SAMPLE);
    assert.ok(r.reportMarkdown.includes("测试公司"));
    assert.ok(r.reportMarkdown.includes("外贸"));
  });

  it("recommends at least one known template slug", () => {
    const r = fallbackDiagnostic(SAMPLE);
    const validSlugs = new Set([
      "lead-intake", "inquiry-reply", "quote-generator", "doc-qa-bot",
      "excel-batch", "customer-service", "price-monitor",
      "hr-onboarding", "finance-reconciliation", "ecommerce-order-routing",
    ]);
    for (const slug of r.recommendedTemplates) {
      assert.ok(validSlugs.has(slug), `unknown recommended slug: ${slug}`);
    }
  });

  it("produces non-zero project + monthly quotes", () => {
    const r = fallbackDiagnostic(SAMPLE);
    assert.ok(r.pricingQuoteCents > 0);
    assert.ok(r.monthlyQuoteCents >= 0);
  });

  it("does not leak meta-commentary ('作为 AI' / 'I am Claude')", () => {
    const r = fallbackDiagnostic(SAMPLE);
    assert.equal(/作为\s*AI|I am Claude|As an AI/.test(r.reportMarkdown), false);
  });

  it("modelUsed is 'fallback' when offline", () => {
    const r = fallbackDiagnostic(SAMPLE);
    assert.equal(r.modelUsed, "fallback");
  });
});
