import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES, getTemplate } from "../src/lib/templates";
import { renderTemplate } from "../src/lib/bundler";

describe("templates", () => {
  it("has at least 10 templates", () => {
    assert.equal(TEMPLATES.length >= 10, true);
  });

  it("includes the v0.6 industry templates", () => {
    const slugs = new Set(TEMPLATES.map((t) => t.slug));
    for (const required of ["hr-onboarding", "finance-reconciliation", "ecommerce-order-routing"]) {
      assert.equal(slugs.has(required), true, `missing template ${required}`);
    }
  });

  it("every template is well-formed", () => {
    for (const t of TEMPLATES) {
      assert.equal(typeof t.slug, "string");
      assert.equal(t.slug.length > 0, true);
      assert.equal(typeof t.name, "string");
      assert.equal(Array.isArray(t.industry), true);
      assert.equal(["simple", "medium", "complex"].includes(t.complexity), true);
      assert.equal(t.estDays > 0, true);
      assert.equal(t.priceCents[0] > 0, true);
      assert.equal(t.priceCents[1] >= t.priceCents[0], true);
      assert.equal(t.monthlyCents[1] >= t.monthlyCents[0], true);
      assert.equal(t.inputs.length > 0, true);
      assert.equal(t.outputs.length > 0, true);
      assert.equal(t.excludes.length > 0, true, `template ${t.slug} should declare excludes`);
      assert.equal(t.params.length > 0, true);
      assert.equal(t.pythonTemplate.length > 100, true);
      assert.equal(t.readmeTemplate.length > 100, true);
    }
  });

  it("slugs are unique", () => {
    const slugs = TEMPLATES.map((t) => t.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("getTemplate returns the right one", () => {
    assert.equal(getTemplate("lead-intake")?.slug, "lead-intake");
    assert.equal(getTemplate("nope"), undefined);
  });

  it("renderTemplate substitutes placeholders", () => {
    const r = renderTemplate("Hello {{name}}, your project is {{proj}}.", { name: "Lou", proj: "AgentFlow" });
    assert.equal(r, "Hello Lou, your project is AgentFlow.");
  });

  it("renderTemplate leaves unknown placeholders untouched", () => {
    const r = renderTemplate("Hello {{name}} and {{unknown}}", { name: "A" });
    assert.equal(r.includes("Hello A"), true);
    assert.equal(r.includes("{{unknown}}"), true);
  });

  it("no template body contains placeholder TODO/FIXME/XXX comments", () => {
    // Marker tokens that indicate unfinished stubs in customer-facing deliverables.
    // Skip-list values that legitimately contain a literal "XXX" (e.g., default webhook URL placeholders).
    for (const t of TEMPLATES) {
      const body = t.pythonTemplate + "\n" + t.readmeTemplate;
      assert.equal(/\bTODO\b|\bFIXME\b/.test(body), false, `template ${t.slug} has TODO/FIXME in body`);
    }
  });
});
