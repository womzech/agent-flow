import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("data-import: CSV parsing", () => {
  let di: typeof import("../src/lib/data-import");

  before(async () => {
    di = await import("../src/lib/data-import");
  });

  after(() => tmp.dispose());

  it("parses simple CSV into headers + rows", () => {
    const csv = "name,age,city\nAlice,30,Beijing\nBob,25,Shanghai";
    const { headers, rows } = di.parseCSV(csv);
    assert.deepEqual(headers, ["name", "age", "city"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Alice");
    assert.equal(rows[1].city, "Shanghai");
  });

  it("handles quoted fields with commas", () => {
    const csv = 'id,note\n1,"hello, world"\n2,plain';
    const { rows } = di.parseCSV(csv);
    assert.equal(rows[0].note, "hello, world");
    assert.equal(rows[1].note, "plain");
  });

  it("handles CRLF line endings", () => {
    const csv = "a,b\r\n1,2\r\n3,4";
    const { headers, rows } = di.parseCSV(csv);
    assert.deepEqual(headers, ["a", "b"]);
    assert.equal(rows.length, 2);
  });

  it("returns empty on blank input", () => {
    const { headers, rows } = di.parseCSV("   ");
    assert.equal(headers.length, 0);
    assert.equal(rows.length, 0);
  });

  it("infers numeric column type", () => {
    const headers = ["id", "score"];
    const rows = [{ id: "T01", score: "95.5" }, { id: "T02", score: "87" }];
    const cols = di.inferColumns(headers, rows);
    const scoreCol = cols.find((c) => c.name === "score")!;
    assert.equal(scoreCol.type, "numeric");
    assert.ok(scoreCol.numericStats);
    assert.equal(scoreCol.numericStats.min, 87);
    assert.equal(scoreCol.numericStats.max, 95.5);
  });

  it("detects missing values correctly", () => {
    const headers = ["name", "category"];
    const rows = [
      { name: "Alice", category: "" },
      { name: "Bob", category: "A" },
      { name: "Carol", category: "" },
    ];
    const cols = di.inferColumns(headers, rows);
    const catCol = cols.find((c) => c.name === "category")!;
    assert.equal(catCol.missingCount, 2);
    assert.ok(catCol.missingPct > 0.6);
  });

  it("detects SLA violations on response_time_hours column", () => {
    const headers = ["ticket_id", "response_time_hours"];
    const rows = [
      { ticket_id: "T1", response_time_hours: "2.0" },
      { ticket_id: "T2", response_time_hours: "6.0" },
      { ticket_id: "T3", response_time_hours: "8.0" },
    ];
    const summary = di.analyzeQuality(headers, rows);
    assert.ok(summary.slaViolations.length > 0, "should detect SLA violations");
    const v = summary.slaViolations[0];
    assert.equal(v.violationCount, 2);
  });

  it("suggests customer-service template for ticket data", () => {
    const headers = ["ticket_id", "subject", "category", "priority", "status", "response_time_hours"];
    const rows = Array.from({ length: 5 }, (_, i) => ({
      ticket_id: `T${i}`,
      subject: `Subject ${i}`,
      category: i === 0 ? "" : "技术支持",
      priority: "高",
      status: "已解决",
      response_time_hours: "5.0",
    }));
    const summary = di.analyzeQuality(headers, rows);
    assert.ok(summary.suggestedTemplates.includes("customer-service"));
  });

  it("counts duplicate rows", () => {
    const headers = ["id", "val"];
    const rows = [
      { id: "1", val: "a" },
      { id: "2", val: "b" },
      { id: "1", val: "a" },
    ];
    const summary = di.analyzeQuality(headers, rows);
    assert.equal(summary.duplicateRows, 1);
  });
});

describe("data-import: parseExcel", () => {
  let di: typeof import("../src/lib/data-import");

  before(async () => {
    di = await import("../src/lib/data-import");
  });

  it("parses a minimal xlsx buffer into headers + rows", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["name", "score"],
      ["Alice", 95],
      ["Bob", 87],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const { headers, rows } = di.parseExcel(buf);
    assert.deepEqual(headers, ["name", "score"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, "Alice");
    assert.equal(rows[1].name, "Bob");
    assert.equal(rows[1].score, "87");
  });

  it("coerces numeric cell values to strings", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["price", "qty"], [9800, 3]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const { rows } = di.parseExcel(buf);
    assert.equal(typeof rows[0].price, "string");
    assert.equal(rows[0].price, "9800");
    assert.equal(rows[0].qty, "3");
  });

  it("returns empty when sheet has only a header row (no data)", async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["col1", "col2"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const { headers, rows } = di.parseExcel(buf);
    assert.equal(headers.length, 0);
    assert.equal(rows.length, 0);
  });
});

describe("delivery-os: repositories", () => {
  let dos: typeof import("../src/lib/delivery-os");
  let di: typeof import("../src/lib/data-import");
  let repo: typeof import("../src/lib/repo");

  before(async () => {
    [dos, di, repo] = await Promise.all([
      import("../src/lib/delivery-os"),
      import("../src/lib/data-import"),
      import("../src/lib/repo"),
    ]);
  });

  it("creates and retrieves a BusinessDataImport", () => {
    const csv = "ticket_id,subject,category\nT1,Test,技术支持\nT2,Issue,";
    const { headers, rows } = di.parseCSV(csv);
    const summary = di.analyzeQuality(headers, rows);

    const imp = dos.businessDataImportsRepo.create({
      filename: "test.csv",
      original_columns: headers,
      inferred_schema: summary.columns,
      row_count: rows.length,
      sample_rows: rows,
      data_quality_summary: summary,
    });

    assert.ok(imp.id > 0);
    assert.equal(imp.filename, "test.csv");
    assert.equal(imp.row_count, 2);

    const fetched = dos.businessDataImportsRepo.get(imp.id);
    assert.equal(fetched?.id, imp.id);
    const parsed = dos.businessDataImportsRepo.parseSummary(fetched!);
    assert.equal(parsed.totalRows, 2);
  });

  it("creates and retrieves a SolutionPackage", () => {
    const pkg = dos.solutionPackagesRepo.create({
      name: "客服自动化方案包",
      target_scenario: "客服工单分类",
      problem_statement: "工单缺失分类，响应超时",
      recommended_automation_steps: ["Step 1: AI分类", "Step 2: 智能路由"],
      delivery_artifacts: ["分类模型", "n8n工作流"],
      acceptance_criteria: ["准确率≥85%"],
      template_slug: "customer-service",
    });

    assert.ok(pkg.id > 0);
    assert.equal(pkg.name, "客服自动化方案包");
    assert.equal(pkg.template_slug, "customer-service");

    const steps = dos.solutionPackagesRepo.parseField<string[]>(pkg.recommended_automation_steps, []);
    assert.equal(steps.length, 2);
    assert.ok(steps[0].includes("AI分类"));
  });

  it("creates SOW with portal token", () => {
    const sow = dos.sowRepo.create({
      scope_included: ["AI工单分类", "智能路由"],
      scope_excluded: ["UI改造"],
      price_cents: 1000000,
      timeline_weeks: 4,
      payment_milestones: [
        { label: "首款", pct: 30, amount_cents: 300000, due: "2026-05-14" },
      ],
    });

    assert.ok(sow.id > 0);
    assert.ok(sow.portal_token, "SOW should have portal token");
    assert.ok(sow.portal_token!.length > 10);
    assert.equal(sow.price_cents, 1000000);
    assert.equal(sow.customer_approval_status, "pending");

    const byToken = dos.sowRepo.getByPortalToken(sow.portal_token!);
    assert.equal(byToken?.id, sow.id);
  });

  it("approves a SOW", () => {
    const sow = dos.sowRepo.create({ price_cents: 500000, timeline_weeks: 3 });
    assert.equal(sow.customer_approval_status, "pending");
    const approved = dos.sowRepo.approve(sow.id);
    assert.equal(approved?.customer_approval_status, "approved");
  });

  it("creates and signs an AcceptanceRecord", () => {
    const ar = dos.acceptanceRecordsRepo.create({
      accepted_features: ["自动分类", "智能路由"],
      known_limitations: ["暂不支持英文"],
      signoff_status: "pending",
    });

    assert.ok(ar.id > 0);
    assert.equal(ar.signoff_status, "pending");
    assert.equal(ar.customer_confirmed_at, null);

    const signed = dos.acceptanceRecordsRepo.sign(ar.id);
    assert.equal(signed?.signoff_status, "signed");
    assert.ok(signed?.customer_confirmed_at, "should record confirmation time");
  });

  it("generateSolutionPackageFromImport produces valid input", () => {
    const csv = "ticket_id,subject,category,response_time_hours\nT1,Sub,技术支持,2\nT2,Oth,,6";
    const { headers, rows } = di.parseCSV(csv);
    const summary = di.analyzeQuality(headers, rows);

    const imp = dos.businessDataImportsRepo.create({
      filename: "gen-test.csv",
      original_columns: headers,
      inferred_schema: summary.columns,
      row_count: rows.length,
      sample_rows: rows,
      data_quality_summary: summary,
    });

    const input = dos.generateSolutionPackageFromImport(imp);
    assert.ok(input.name.length > 0);
    assert.ok((input.problem_statement ?? "").length > 0);
    assert.ok((input.recommended_automation_steps ?? []).length > 0);
    assert.ok(input.template_slug, "should infer a template slug");
    assert.equal(input.data_import_id, imp.id);
  });

  it("generateSOWFromPackage produces valid SOW input with milestones", () => {
    const pkg = dos.solutionPackagesRepo.create({
      name: "Test Package",
      pricing_model: {
        recommended_cents: 800000,
        recommended_monthly_cents: 80000,
        est_days: 7,
      },
      recommended_automation_steps: ["Step 1", "Step 2"],
      delivery_artifacts: ["脚本", "文档"],
      required_inputs: ["CSV数据"],
    });

    const input = dos.generateSOWFromPackage(pkg);
    assert.equal(input.price_cents, 800000);
    assert.ok(input.timeline_weeks && input.timeline_weeks > 0);
    assert.ok((input.payment_milestones ?? []).length === 3, "should generate 3 milestones");
    const total = (input.payment_milestones ?? []).reduce((s, m) => s + m.amount_cents, 0);
    assert.equal(total, 800000, "milestones should sum to total price");
  });

  it("creates SOW with portal_token_ttl_days and exposes expiry", () => {
    const sow = dos.sowRepo.create({ price_cents: 100000, timeline_weeks: 2, portal_token_ttl_days: 1 });
    assert.ok(sow.token_expires_at, "should record token_expires_at");
    const ms = new Date(sow.token_expires_at!.replace(" ", "T") + "Z").getTime() - Date.now();
    assert.ok(ms > 0 && ms < 2 * 86400_000, "expires within 2 days");
    const active = dos.sowRepo.resolveActivePortalToken(sow.portal_token!);
    assert.equal(active?.id, sow.id, "active token resolves");
  });

  it("revokePortalToken makes resolveActivePortalToken return undefined", () => {
    const sow = dos.sowRepo.create({ price_cents: 100000, timeline_weeks: 2 });
    dos.sowRepo.revokePortalToken(sow.id);
    const active = dos.sowRepo.resolveActivePortalToken(sow.portal_token!);
    assert.equal(active, undefined);
    const direct = dos.sowRepo.getByPortalToken(sow.portal_token!);
    assert.ok(direct?.token_revoked_at, "revoked_at should be set");
  });

  it("recordPortalView increments token_view_count + sets last_viewed_at", () => {
    const sow = dos.sowRepo.create({ price_cents: 100000, timeline_weeks: 2 });
    dos.sowRepo.recordPortalView(sow.portal_token!);
    dos.sowRepo.recordPortalView(sow.portal_token!);
    const reread = dos.sowRepo.getByPortalToken(sow.portal_token!);
    assert.equal(reread?.token_view_count, 2);
    assert.ok(reread?.token_last_viewed_at);
  });

  it("diagnostic share token: revoke + recordShareView", () => {
    const d = repo.diagnosticsRepo.create({ title: "test-share", questionnaire: {}, lead_id: null, client_id: null });
    const token = repo.diagnosticsRepo.ensureShareToken(d.id, { ttlDays: 7 });
    repo.diagnosticsRepo.recordShareView(token);
    let reread = repo.diagnosticsRepo.get(d.id);
    assert.equal(reread?.token_view_count, 1);
    assert.ok(reread?.token_expires_at);
    repo.diagnosticsRepo.revokeShareToken(d.id);
    reread = repo.diagnosticsRepo.get(d.id);
    assert.ok(reread?.token_revoked_at, "should be revoked");
  });

  it("isTokenExpired handles null + past + future", () => {
    assert.equal(repo.isTokenExpired(null), false);
    assert.equal(repo.isTokenExpired(undefined), false);
    const past = new Date(Date.now() - 86400_000).toISOString().replace("T", " ").slice(0, 19);
    const future = new Date(Date.now() + 86400_000).toISOString().replace("T", " ").slice(0, 19);
    assert.equal(repo.isTokenExpired(past), true);
    assert.equal(repo.isTokenExpired(future), false);
  });
});
