import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("search: v0.5 Delivery OS entities are indexed", () => {
  let search: typeof import("../src/lib/search");
  let dos: typeof import("../src/lib/delivery-os");
  let allPerms: Set<import("../src/lib/schema").Permission>;

  before(async () => {
    const { getDbReady } = await import("../src/lib/db");
    await getDbReady();
    search = await import("../src/lib/search");
    dos = await import("../src/lib/delivery-os");
    const schema = await import("../src/lib/schema");
    allPerms = new Set(schema.ALL_PERMISSIONS.map((p) => schema.permKey(p.action, p.resource)));

    dos.businessDataImportsRepo.create({
      filename: "spider-flagship-inquiries.csv",
      source_type: "csv",
      original_columns: ["order_id", "customer"],
      inferred_schema: [],
      row_count: 0,
      sample_rows: [],
      data_quality_summary: { totalRows: 0, totalColumns: 2, duplicateRows: 0, missingCellsTotal: 0, missingCellsPct: 0, columns: [], slaViolations: [], piiFlags: [], issues: [], recommendations: [], suggestedTemplates: [] },
    });

    dos.solutionPackagesRepo.create({
      name: "外贸询盘旗舰版方案包",
      target_scenario: "阿里国际站询盘自动化",
      problem_statement: "spider crawl flagship",
      template_slug: "inquiry-reply",
    });

    dos.sowRepo.create({
      scope_included: ["spider-flagship-scope"],
      scope_excluded: [],
      price_cents: 100,
      timeline_weeks: 2,
    });

    dos.acceptanceRecordsRepo.create({
      accepted_features: ["spider-flagship-feature"],
    });

    search._resetForTest();
  });

  after(() => tmp.dispose());

  it("rebuildAll picks up business_data_imports / solution_packages / statement_of_work / acceptance_records", () => {
    const hits = search.searchAll("flagship", allPerms, 50);
    const kinds = new Set(hits.map((h) => h.kind));
    assert.ok(kinds.has("import"), "expected import hit");
    assert.ok(kinds.has("package"), "expected package hit");
    assert.ok(kinds.has("sow"), "expected sow hit");
    assert.ok(kinds.has("acceptance"), "expected acceptance hit");
  });

  it("respects permissions: read:projects gates package/sow/acceptance", () => {
    const limited = new Set<import("../src/lib/schema").Permission>(["read:clients"]);
    const hits = search.searchAll("flagship", limited, 50);
    const kinds = new Set(hits.map((h) => h.kind));
    assert.equal(kinds.has("package"), false);
    assert.equal(kinds.has("sow"), false);
    assert.equal(kinds.has("acceptance"), false);
    assert.ok(kinds.has("import"), "import is still gated by read:clients");
  });
});
