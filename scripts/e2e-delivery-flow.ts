/**
 * End-to-end validation for the Delivery OS closed loop:
 *   CSV import → quality analysis → solution package → SOW → acceptance record
 *
 * Run: npm run e2e:delivery-flow
 *
 * No server required — exercises the lib layer directly against a temp DB.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated temp DB — must be set before any lib import opens the DB.
const tmpDir = mkdtempSync(join(tmpdir(), "af-e2e-"));
process.env.AGENTFLOW_DB = join(tmpDir, "e2e.db");

function cleanup() {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(1); });

function pass(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(msg: string) { console.error(`  ✗ ${msg}`); process.exitCode = 1; }
function section(title: string) { console.log(`\n▶ ${title}`); }

async function main() {
  const { parseCSV, analyzeQuality, formatQualitySummaryText } = await import("../src/lib/data-import");
  const {
    businessDataImportsRepo,
    solutionPackagesRepo,
    sowRepo,
    acceptanceRecordsRepo,
    generateSolutionPackageFromImport,
    generateSOWFromPackage,
  } = await import("../src/lib/delivery-os");
  const { clientsRepo, projectsRepo } = await import("../src/lib/repo");
  const { getDb } = await import("../src/lib/db");

  // Force DB open + schema init
  getDb();

  // ── STEP 0: Load test CSV ──────────────────────────────────────────────────
  section("Step 0: Load test fixture CSV");
  const csvPath = join(process.cwd(), "tests/fixtures/customer-service-tickets.csv");
  const csvText = readFileSync(csvPath, "utf-8");
  const { headers, rows } = parseCSV(csvText);
  pass(`Parsed ${rows.length} rows × ${headers.length} columns from customer-service-tickets.csv`);
  pass(`Columns: ${headers.join(", ")}`);

  // ── STEP 1: Create client + project ───────────────────────────────────────
  section("Step 1: Create client + project");
  const client = clientsRepo.create({
    name: "张经理",
    company: "示范电商科技有限公司",
    industry: "电商",
    size: "50-200人",
    contact: "zhang@demo.com",
    billing_email: "finance@demo.com",
    notes: "主营3C产品，客服团队10人",
  });
  pass(`Client #${client.id}: ${client.company}`);

  const project = projectsRepo.create({
    client_id: client.id,
    diagnostic_id: null,
    name: "客服工单智能分类自动化项目",
    status: "pilot",
    project_fee_cents: 0,
    monthly_fee_cents: 0,
    notes: "基于30条历史工单数据驱动诊断",
  });
  pass(`Project #${project.id}: ${project.name}`);

  // ── STEP 2: Data quality analysis ─────────────────────────────────────────
  section("Step 2: Data quality analysis");
  const summary = analyzeQuality(headers, rows);
  pass(`${summary.totalRows} rows · ${summary.totalColumns} columns · ${summary.missingCellsPct}% missing`);
  pass(`Duplicate rows: ${summary.duplicateRows}`);

  if (summary.issues.length > 0) {
    console.log("  Issues detected:");
    for (const issue of summary.issues) console.log(`    - ${issue}`);
  }
  if (summary.slaViolations.length > 0) {
    console.log("  SLA violations:");
    for (const v of summary.slaViolations) {
      console.log(`    - ${v.column}: ${v.violationCount} records (${v.violationPct}%) exceed ${v.threshold}h`);
    }
  }
  if (summary.recommendations.length > 0) {
    console.log("  Recommendations:");
    for (const r of summary.recommendations) console.log(`    → ${r}`);
  }
  pass(`Suggested templates: [${summary.suggestedTemplates.join(", ")}]`);

  // ── STEP 3: Persist data import ────────────────────────────────────────────
  section("Step 3: Persist BusinessDataImport to SQLite");
  const imp = businessDataImportsRepo.create({
    project_id: project.id,
    client_id: client.id,
    source_type: "csv",
    filename: "customer-service-tickets.csv",
    original_columns: headers,
    inferred_schema: summary.columns,
    row_count: rows.length,
    sample_rows: rows,
    data_quality_summary: summary,
  });
  pass(`BusinessDataImport #${imp.id} → project #${project.id}`);

  const fetchedImp = businessDataImportsRepo.get(imp.id);
  const parsedSummary = businessDataImportsRepo.parseSummary(fetchedImp!);
  if (parsedSummary.totalRows === rows.length) pass(`Persisted summary verified (${parsedSummary.totalRows} rows)`);
  else fail("Row count mismatch in persisted summary");

  // ── STEP 4: Generate solution package ──────────────────────────────────────
  section("Step 4: Generate SolutionPackage");
  const pkgInput = generateSolutionPackageFromImport(imp, project.id);
  const pkg = solutionPackagesRepo.create(pkgInput);
  pass(`SolutionPackage #${pkg.id}: "${pkg.name}"`);
  pass(`Template: ${pkg.template_slug}`);

  const steps = solutionPackagesRepo.parseField<string[]>(pkg.recommended_automation_steps, []);
  pass(`Automation steps (${steps.length}): ${steps.slice(0, 2).join(" | ")}`);

  const pricing = solutionPackagesRepo.parseField<{ recommended_cents?: number; est_days?: number }>(pkg.pricing_model, {});
  pass(`Pricing: ¥${((pricing.recommended_cents ?? 0) / 100).toLocaleString()} · ${pricing.est_days ?? "?"} days`);

  // ── STEP 5: Generate SOW ───────────────────────────────────────────────────
  section("Step 5: Generate Statement of Work");
  const sowInput = generateSOWFromPackage(pkg);
  const sow = sowRepo.create(sowInput);
  pass(`SOW #${sow.id}: ¥${(sow.price_cents / 100).toLocaleString()} · ${sow.timeline_weeks} weeks`);
  pass(`Portal token: ${sow.portal_token}`);
  pass(`Approval status: ${sow.customer_approval_status}`);

  const milestones = sowRepo.parseField<Array<{ label: string; pct: number; amount_cents: number }>>(sow.payment_milestones, []);
  for (const m of milestones) {
    console.log(`    ${m.pct}% — ${m.label} — ¥${(m.amount_cents / 100).toLocaleString()}`);
  }

  const byToken = sowRepo.getByPortalToken(sow.portal_token!);
  if (byToken) pass(`Portal URL: /portal/${sow.portal_token}`);
  else fail("Portal token lookup failed");

  // ── STEP 6: Approve SOW ────────────────────────────────────────────────────
  section("Step 6: Simulate customer approval via portal");
  const approvedSOW = sowRepo.approve(sow.id);
  if (approvedSOW?.customer_approval_status === "approved") pass("SOW approved");
  else fail("SOW approval failed");

  // ── STEP 7: Create + sign acceptance record ────────────────────────────────
  section("Step 7: AcceptanceRecord — create + sign");
  const criteria = solutionPackagesRepo.parseField<string[]>(pkg.acceptance_criteria, []);
  const ar = acceptanceRecordsRepo.create({
    project_id: project.id,
    solution_package_id: pkg.id,
    accepted_features: criteria.slice(0, 3),
    known_limitations: ["首批模型需 ≥500 条标注数据微调", "暂不支持英文混合工单"],
    excluded_items: ["客服系统 UI 改造", "第三方平台账号费用"],
    evidence_links: [`http://localhost:3000/portal/${sow.portal_token}`],
    signoff_status: "pending",
  });
  pass(`AcceptanceRecord #${ar.id} created (${ar.signoff_status})`);

  const signedAR = acceptanceRecordsRepo.sign(ar.id);
  if (signedAR?.signoff_status === "signed") pass(`Signed at ${signedAR.customer_confirmed_at}`);
  else fail("Acceptance sign failed");

  // ── STEP 8: Full persistence verification ─────────────────────────────────
  section("Step 8: Verify all objects in SQLite");
  const db = getDb();
  function count(table: string, where = "") {
    return (db.prepare(`SELECT COUNT(*) AS c FROM ${table} ${where}`).get() as { c: number }).c;
  }

  const checks: Array<[string, () => boolean]> = [
    ["business_data_imports", () => count("business_data_imports", `WHERE id=${imp.id}`) === 1],
    ["solution_packages", () => count("solution_packages", `WHERE id=${pkg.id}`) === 1],
    ["statement_of_work", () => count("statement_of_work", `WHERE id=${sow.id}`) === 1],
    ["acceptance_records", () => count("acceptance_records", `WHERE id=${ar.id}`) === 1],
    ["SOW portal_token lookup", () => !!sowRepo.getByPortalToken(sow.portal_token!)],
    ["SOW approved", () => sowRepo.get(sow.id)?.customer_approval_status === "approved"],
    ["Acceptance signed", () => acceptanceRecordsRepo.get(ar.id)?.signoff_status === "signed"],
  ];

  for (const [name, check] of checks) {
    if (check()) pass(name);
    else fail(name);
  }

  // ── Final Summary ──────────────────────────────────────────────────────────
  section("Final Summary");
  console.log(`
  Scenario  : 客服工单智能分类自动化
  Client    : #${client.id} ${client.company}
  Project   : #${project.id} ${project.name}
  Import    : #${imp.id} ${imp.filename} (${imp.row_count} rows, ${headers.length} cols)
  Package   : #${pkg.id} ${pkg.name}
  SOW       : #${sow.id} ¥${(sow.price_cents / 100).toLocaleString()} ${sow.timeline_weeks}周
  Portal    : /portal/${sow.portal_token}
  Acceptance: #${ar.id} signed ✓

  Issues    : ${summary.issues.length}
  SLA viols : ${summary.slaViolations.length}
  Recs      : ${summary.recommendations.length}

${formatQualitySummaryText(summary).split("\n").map((l) => "  " + l).join("\n")}
`);

  if (process.exitCode) {
    console.error("❌ E2E validation FAILED");
  } else {
    console.log("✅ E2E validation PASSED — all objects persisted and verified");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
