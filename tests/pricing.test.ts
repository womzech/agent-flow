import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePricing } from "../src/lib/pricing";

describe("pricing", () => {
  it("returns zero when no templates", () => {
    const r = computePricing({ templates: [], customizationHours: 0, hourlyRateCny: 800, includeMonthly: true });
    assert.equal(r.projectFeeCents, 0);
    assert.equal(r.monthlyFeeCents, 0);
  });

  it("sums template mid-points", () => {
    const r = computePricing({
      templates: ["lead-intake"],
      customizationHours: 0,
      hourlyRateCny: 800,
      includeMonthly: true,
    });
    // lead-intake range: 2000-5000元 → mid 3500元 = 350000 cents
    assert.equal(r.projectFeeCents, 350000);
    // monthly: 500-1000 → mid 750 = 75000 cents
    assert.equal(r.monthlyFeeCents, 75000);
  });

  it("adds customization hours", () => {
    const r = computePricing({
      templates: [],
      customizationHours: 10,
      hourlyRateCny: 800,
      includeMonthly: false,
    });
    assert.equal(r.projectFeeCents, 10 * 800 * 100);
    assert.equal(r.monthlyFeeCents, 0);
  });

  it("excludes monthly when includeMonthly is false", () => {
    const r = computePricing({
      templates: ["lead-intake"],
      customizationHours: 0,
      hourlyRateCny: 800,
      includeMonthly: false,
    });
    assert.equal(r.monthlyFeeCents, 0);
    assert.equal(r.projectFeeCents > 0, true);
  });

  it("ignores unknown template slugs", () => {
    const r = computePricing({
      templates: ["does-not-exist"],
      customizationHours: 0,
      hourlyRateCny: 800,
      includeMonthly: true,
    });
    assert.equal(r.projectFeeCents, 0);
  });
});
