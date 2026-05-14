/**
 * Delivery OS — repositories and business logic for the v5 domain objects:
 *   BusinessDataImport → SolutionPackage → StatementOfWork → AcceptanceRecord
 *
 * All repos follow the same sync (better-sqlite3) pattern as repo.ts.
 */

import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { DataQualitySummary } from "./data-import";
import { TEMPLATE_BY_SLUG } from "./templates";

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                               */
/* ------------------------------------------------------------------ */

export interface BusinessDataImport {
  id: number;
  project_id: number | null;
  client_id: number | null;
  source_type: string;
  filename: string;
  original_columns: string;   // JSON string[]
  inferred_schema: string;    // JSON ColumnInfo[]
  row_count: number;
  sample_rows: string;        // JSON Record<string,string>[]
  data_quality_summary: string; // JSON DataQualitySummary
  created_at: string;
}

export interface SolutionPackage {
  id: number;
  project_id: number | null;
  name: string;
  target_scenario: string;
  problem_statement: string;
  required_inputs: string;              // JSON string[]
  workflow_blueprint_id: number | null;
  recommended_automation_steps: string; // JSON string[]
  delivery_artifacts: string;           // JSON string[]
  pricing_model: string;                // JSON object
  acceptance_criteria: string;          // JSON string[]
  maintenance_plan: string;             // JSON object
  version: string;
  template_slug: string | null;
  data_import_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StatementOfWork {
  id: number;
  project_id: number | null;
  solution_package_id: number | null;
  scope_included: string;           // JSON string[]
  scope_excluded: string;           // JSON string[]
  assumptions: string;              // JSON string[]
  deliverables: string;             // JSON string[]
  timeline_weeks: number;
  price_cents: number;
  payment_milestones: string;       // JSON PaymentMilestone[]
  customer_approval_status: string; // pending | approved | revision_requested
  portal_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentMilestone {
  label: string;
  pct: number;
  amount_cents: number;
  due: string;
}

export interface AcceptanceRecord {
  id: number;
  project_id: number | null;
  solution_package_id: number | null;
  accepted_features: string;    // JSON string[]
  known_limitations: string;    // JSON string[]
  excluded_items: string;       // JSON string[]
  evidence_links: string;       // JSON string[]
  customer_confirmed_at: string | null;
  signoff_status: string;       // pending | signed | rejected
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  businessDataImportsRepo                                             */
/* ------------------------------------------------------------------ */

export const businessDataImportsRepo = {
  list(projectId?: number): BusinessDataImport[] {
    if (typeof projectId === "number") {
      return getDb()
        .prepare("SELECT * FROM business_data_imports WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as BusinessDataImport[];
    }
    return getDb()
      .prepare("SELECT * FROM business_data_imports ORDER BY created_at DESC")
      .all() as BusinessDataImport[];
  },
  get(id: number): BusinessDataImport | undefined {
    return getDb()
      .prepare("SELECT * FROM business_data_imports WHERE id = ?")
      .get(id) as BusinessDataImport | undefined;
  },
  create(input: {
    project_id?: number | null;
    client_id?: number | null;
    source_type?: string;
    filename: string;
    original_columns: string[];
    inferred_schema: object;
    row_count: number;
    sample_rows: Record<string, string>[];
    data_quality_summary: DataQualitySummary;
  }): BusinessDataImport {
    const info = getDb()
      .prepare(
        `INSERT INTO business_data_imports
           (project_id, client_id, source_type, filename, original_columns, inferred_schema,
            row_count, sample_rows, data_quality_summary)
         VALUES (@project_id, @client_id, @source_type, @filename, @original_columns,
                 @inferred_schema, @row_count, @sample_rows, @data_quality_summary)`,
      )
      .run({
        project_id: input.project_id ?? null,
        client_id: input.client_id ?? null,
        source_type: input.source_type ?? "csv",
        filename: input.filename,
        original_columns: JSON.stringify(input.original_columns),
        inferred_schema: JSON.stringify(input.inferred_schema),
        row_count: input.row_count,
        sample_rows: JSON.stringify(input.sample_rows.slice(0, 5)),
        data_quality_summary: JSON.stringify(input.data_quality_summary),
      });
    return this.get(Number(info.lastInsertRowid))!;
  },

  parseSummary(imp: BusinessDataImport): DataQualitySummary {
    try { return JSON.parse(imp.data_quality_summary); } catch { return {} as DataQualitySummary; }
  },
  parseColumns(imp: BusinessDataImport): string[] {
    try { return JSON.parse(imp.original_columns); } catch { return []; }
  },
  parseSampleRows(imp: BusinessDataImport): Record<string, string>[] {
    try { return JSON.parse(imp.sample_rows); } catch { return []; }
  },
};

/* ------------------------------------------------------------------ */
/*  solutionPackagesRepo                                                */
/* ------------------------------------------------------------------ */

export const solutionPackagesRepo = {
  list(projectId?: number): SolutionPackage[] {
    if (typeof projectId === "number") {
      return getDb()
        .prepare("SELECT * FROM solution_packages WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as SolutionPackage[];
    }
    return getDb()
      .prepare("SELECT * FROM solution_packages ORDER BY created_at DESC")
      .all() as SolutionPackage[];
  },
  get(id: number): SolutionPackage | undefined {
    return getDb()
      .prepare("SELECT * FROM solution_packages WHERE id = ?")
      .get(id) as SolutionPackage | undefined;
  },
  create(input: {
    project_id?: number | null;
    name: string;
    target_scenario?: string;
    problem_statement?: string;
    required_inputs?: string[];
    workflow_blueprint_id?: number | null;
    recommended_automation_steps?: string[];
    delivery_artifacts?: string[];
    pricing_model?: object;
    acceptance_criteria?: string[];
    maintenance_plan?: object;
    version?: string;
    template_slug?: string | null;
    data_import_id?: number | null;
  }): SolutionPackage {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const info = getDb()
      .prepare(
        `INSERT INTO solution_packages
           (project_id, name, target_scenario, problem_statement, required_inputs,
            workflow_blueprint_id, recommended_automation_steps, delivery_artifacts,
            pricing_model, acceptance_criteria, maintenance_plan, version,
            template_slug, data_import_id, created_at, updated_at)
         VALUES (@project_id, @name, @target_scenario, @problem_statement, @required_inputs,
                 @workflow_blueprint_id, @recommended_automation_steps, @delivery_artifacts,
                 @pricing_model, @acceptance_criteria, @maintenance_plan, @version,
                 @template_slug, @data_import_id, @created_at, @updated_at)`,
      )
      .run({
        project_id: input.project_id ?? null,
        name: input.name,
        target_scenario: input.target_scenario ?? "",
        problem_statement: input.problem_statement ?? "",
        required_inputs: JSON.stringify(input.required_inputs ?? []),
        workflow_blueprint_id: input.workflow_blueprint_id ?? null,
        recommended_automation_steps: JSON.stringify(input.recommended_automation_steps ?? []),
        delivery_artifacts: JSON.stringify(input.delivery_artifacts ?? []),
        pricing_model: JSON.stringify(input.pricing_model ?? {}),
        acceptance_criteria: JSON.stringify(input.acceptance_criteria ?? []),
        maintenance_plan: JSON.stringify(input.maintenance_plan ?? {}),
        version: input.version ?? "1.0",
        template_slug: input.template_slug ?? null,
        data_import_id: input.data_import_id ?? null,
        created_at: now,
        updated_at: now,
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<Omit<SolutionPackage, "id" | "created_at">>): SolutionPackage | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
    const next = { ...current, ...patch, updated_at };
    getDb()
      .prepare(
        `UPDATE solution_packages
         SET project_id=@project_id, name=@name, target_scenario=@target_scenario,
             problem_statement=@problem_statement, required_inputs=@required_inputs,
             workflow_blueprint_id=@workflow_blueprint_id,
             recommended_automation_steps=@recommended_automation_steps,
             delivery_artifacts=@delivery_artifacts, pricing_model=@pricing_model,
             acceptance_criteria=@acceptance_criteria, maintenance_plan=@maintenance_plan,
             version=@version, template_slug=@template_slug, data_import_id=@data_import_id,
             updated_at=@updated_at
         WHERE id=@id`,
      )
      .run(next);
    return this.get(id);
  },
  parseField<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
};

/* ------------------------------------------------------------------ */
/*  sowRepo                                                             */
/* ------------------------------------------------------------------ */

export const sowRepo = {
  list(projectId?: number): StatementOfWork[] {
    if (typeof projectId === "number") {
      return getDb()
        .prepare("SELECT * FROM statement_of_work WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as StatementOfWork[];
    }
    return getDb()
      .prepare("SELECT * FROM statement_of_work ORDER BY created_at DESC")
      .all() as StatementOfWork[];
  },
  get(id: number): StatementOfWork | undefined {
    return getDb()
      .prepare("SELECT * FROM statement_of_work WHERE id = ?")
      .get(id) as StatementOfWork | undefined;
  },
  getByPortalToken(token: string): StatementOfWork | undefined {
    return getDb()
      .prepare("SELECT * FROM statement_of_work WHERE portal_token = ?")
      .get(token) as StatementOfWork | undefined;
  },
  create(input: {
    project_id?: number | null;
    solution_package_id?: number | null;
    scope_included?: string[];
    scope_excluded?: string[];
    assumptions?: string[];
    deliverables?: string[];
    timeline_weeks?: number;
    price_cents?: number;
    payment_milestones?: PaymentMilestone[];
    customer_approval_status?: string;
  }): StatementOfWork {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const portal_token = randomUUID();
    const info = getDb()
      .prepare(
        `INSERT INTO statement_of_work
           (project_id, solution_package_id, scope_included, scope_excluded, assumptions,
            deliverables, timeline_weeks, price_cents, payment_milestones,
            customer_approval_status, portal_token, created_at, updated_at)
         VALUES (@project_id, @solution_package_id, @scope_included, @scope_excluded,
                 @assumptions, @deliverables, @timeline_weeks, @price_cents,
                 @payment_milestones, @customer_approval_status, @portal_token,
                 @created_at, @updated_at)`,
      )
      .run({
        project_id: input.project_id ?? null,
        solution_package_id: input.solution_package_id ?? null,
        scope_included: JSON.stringify(input.scope_included ?? []),
        scope_excluded: JSON.stringify(input.scope_excluded ?? []),
        assumptions: JSON.stringify(input.assumptions ?? []),
        deliverables: JSON.stringify(input.deliverables ?? []),
        timeline_weeks: input.timeline_weeks ?? 4,
        price_cents: input.price_cents ?? 0,
        payment_milestones: JSON.stringify(input.payment_milestones ?? []),
        customer_approval_status: input.customer_approval_status ?? "pending",
        portal_token,
        created_at: now,
        updated_at: now,
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  approve(id: number): StatementOfWork | undefined {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    getDb()
      .prepare(`UPDATE statement_of_work SET customer_approval_status='approved', updated_at=? WHERE id=?`)
      .run(now, id);
    return this.get(id);
  },
  parseField<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
};

/* ------------------------------------------------------------------ */
/*  acceptanceRecordsRepo                                               */
/* ------------------------------------------------------------------ */

export const acceptanceRecordsRepo = {
  list(projectId?: number): AcceptanceRecord[] {
    if (typeof projectId === "number") {
      return getDb()
        .prepare("SELECT * FROM acceptance_records WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as AcceptanceRecord[];
    }
    return getDb()
      .prepare("SELECT * FROM acceptance_records ORDER BY created_at DESC")
      .all() as AcceptanceRecord[];
  },
  get(id: number): AcceptanceRecord | undefined {
    return getDb()
      .prepare("SELECT * FROM acceptance_records WHERE id = ?")
      .get(id) as AcceptanceRecord | undefined;
  },
  create(input: {
    project_id?: number | null;
    solution_package_id?: number | null;
    accepted_features?: string[];
    known_limitations?: string[];
    excluded_items?: string[];
    evidence_links?: string[];
    signoff_status?: string;
  }): AcceptanceRecord {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const info = getDb()
      .prepare(
        `INSERT INTO acceptance_records
           (project_id, solution_package_id, accepted_features, known_limitations,
            excluded_items, evidence_links, signoff_status, created_at, updated_at)
         VALUES (@project_id, @solution_package_id, @accepted_features, @known_limitations,
                 @excluded_items, @evidence_links, @signoff_status, @created_at, @updated_at)`,
      )
      .run({
        project_id: input.project_id ?? null,
        solution_package_id: input.solution_package_id ?? null,
        accepted_features: JSON.stringify(input.accepted_features ?? []),
        known_limitations: JSON.stringify(input.known_limitations ?? []),
        excluded_items: JSON.stringify(input.excluded_items ?? []),
        evidence_links: JSON.stringify(input.evidence_links ?? []),
        signoff_status: input.signoff_status ?? "pending",
        created_at: now,
        updated_at: now,
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  sign(id: number): AcceptanceRecord | undefined {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    getDb()
      .prepare(`UPDATE acceptance_records SET signoff_status='signed', customer_confirmed_at=?, updated_at=? WHERE id=?`)
      .run(now, now, id);
    return this.get(id);
  },
  parseField<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  },
};

/* ------------------------------------------------------------------ */
/*  Business logic: generate SolutionPackage from a data import        */
/* ------------------------------------------------------------------ */

export function generateSolutionPackageFromImport(
  imp: BusinessDataImport,
  projectId?: number | null,
): Parameters<typeof solutionPackagesRepo.create>[0] {
  const summary: DataQualitySummary = JSON.parse(imp.data_quality_summary || "{}");
  const templateSlug = (summary.suggestedTemplates ?? [])[0] ?? "customer-service";
  const template = TEMPLATE_BY_SLUG[templateSlug];

  const problemParts: string[] = [];
  if (summary.issues && summary.issues.length > 0) {
    problemParts.push(`数据审计发现以下业务问题：`);
    for (const i of summary.issues) problemParts.push(`• ${i}`);
  }
  if (summary.recommendations && summary.recommendations.length > 0) {
    problemParts.push(`\n优化方向：`);
    for (const r of summary.recommendations) problemParts.push(`• ${r}`);
  }
  const problem_statement = problemParts.join("\n") || "基于上传数据诊断，发现可自动化优化空间。";

  const steps: string[] = [];
  if (template) {
    if (template.outputs && template.outputs.length > 0) {
      steps.push(...template.outputs.map((o) => `产出：${o}`));
    }
  }
  // Add steps based on quality analysis
  if (summary.slaViolations && summary.slaViolations.length > 0) {
    steps.unshift("Step 3: 配置 SLA 监控与自动告警（阈值：超时即升级）");
    steps.unshift("Step 2: 部署智能路由规则（基于优先级 + 分类自动分配）");
  }
  const missingCatCols = (summary.columns ?? []).filter(
    (c) => (c.type === "category" || c.type === "status") && c.missingPct > 0.05,
  );
  if (missingCatCols.length > 0) {
    steps.unshift("Step 1: 训练 AI 分类模型，自动补全缺失分类字段");
  }
  if (steps.length === 0) steps.push("Step 1: 数据接入与清洗", "Step 2: 自动化流程部署", "Step 3: 监控与报警配置");

  const pricingModel = template
    ? {
        min_cents: template.priceCents[0],
        max_cents: template.priceCents[1],
        monthly_min_cents: template.monthlyCents[0],
        monthly_max_cents: template.monthlyCents[1],
        recommended_cents: Math.round((template.priceCents[0] + template.priceCents[1]) / 2),
        recommended_monthly_cents: Math.round((template.monthlyCents[0] + template.monthlyCents[1]) / 2),
        note: template.pricingNote ?? "",
        est_days: template.estDays,
      }
    : {};

  const acceptance_criteria: string[] = template
    ? [
        ...(template.outputs ?? []).map((o) => `交付成果可验证：${o}`),
        "系统在验收数据集上自动化准确率 ≥ 85%",
        "SLA 监控告警在测试场景中正常触发",
        "客户代表完成操作培训并签署验收单",
      ]
    : ["功能按方案设计正常运行", "客户代表签署验收单"];

  const maintenance_plan = {
    monthly_items: [
      "每月数据质量巡检（异常率、缺失率报告）",
      "模型效果评估（准确率、覆盖率跟踪）",
      "工作流日志审查与异常处理",
      "版本升级与安全补丁",
    ],
    monthly_cents: template ? Math.round((template.monthlyCents[0] + template.monthlyCents[1]) / 2) : 100000,
  };

  return {
    project_id: projectId ?? null,
    name: template ? `${template.name}方案包` : "自动化方案包",
    target_scenario: template?.short ?? "业务自动化",
    problem_statement,
    required_inputs: template?.inputs ?? ["历史业务数据（CSV）", "业务流程说明", "IT 环境说明"],
    recommended_automation_steps: steps,
    delivery_artifacts: template?.outputs ?? ["自动化脚本", "部署文档", "操作手册"],
    pricing_model: pricingModel,
    acceptance_criteria,
    maintenance_plan,
    template_slug: templateSlug,
    data_import_id: imp.id,
  };
}

/* ------------------------------------------------------------------ */
/*  Business logic: generate SOW from SolutionPackage                  */
/* ------------------------------------------------------------------ */

export function generateSOWFromPackage(
  pkg: SolutionPackage,
): Parameters<typeof sowRepo.create>[0] {
  const pricingModel = solutionPackagesRepo.parseField<{
    recommended_cents?: number;
    recommended_monthly_cents?: number;
    est_days?: number;
    note?: string;
  }>(pkg.pricing_model, {});

  const price_cents = pricingModel.recommended_cents ?? 1000000;
  const timeline_weeks = pricingModel.est_days ? Math.ceil(pricingModel.est_days / 5) : 4;

  const steps: string[] = solutionPackagesRepo.parseField<string[]>(pkg.recommended_automation_steps, []);
  const artifacts: string[] = solutionPackagesRepo.parseField<string[]>(pkg.delivery_artifacts, []);
  const criteria: string[] = solutionPackagesRepo.parseField<string[]>(pkg.acceptance_criteria, []);
  const inputs: string[] = solutionPackagesRepo.parseField<string[]>(pkg.required_inputs, []);

  const scope_included: string[] = steps.length > 0 ? steps : ["自动化流程开发与部署", "数据接入与清洗"];

  const template = pkg.template_slug ? TEMPLATE_BY_SLUG[pkg.template_slug] : null;
  const scope_excluded: string[] = template?.excludes ?? [
    "客户内部 IT 基础设施改造",
    "第三方平台账号申请与费用",
    "超出本次范围的定制化需求",
  ];

  const assumptions: string[] = [
    `客户提供本次诊断所用数据的完整授权`,
    `客户指定 1 名内部对接人全程配合`,
    `交付物在客户现有环境中可正常运行（Python 3.9+ / Node 18+）`,
    ...(inputs.length > 0 ? [`客户已准备好以下输入资源：${inputs.join("、")}`] : []),
  ];

  const deliverables: string[] = artifacts.length > 0 ? artifacts : ["自动化脚本", "n8n 工作流 JSON", "操作手册"];

  const t1 = Math.round(price_cents * 0.3);
  const t2 = Math.round(price_cents * 0.4);
  const t3 = price_cents - t1 - t2;

  const todayMs = Date.now();
  const wk = 7 * 24 * 60 * 60 * 1000;
  const due1 = new Date(todayMs).toISOString().slice(0, 10);
  const due2 = new Date(todayMs + Math.ceil(timeline_weeks / 2) * wk).toISOString().slice(0, 10);
  const due3 = new Date(todayMs + timeline_weeks * wk).toISOString().slice(0, 10);

  const payment_milestones: PaymentMilestone[] = [
    { label: "合同签署（首款）", pct: 30, amount_cents: t1, due: due1 },
    { label: "方案 Demo 验收（中期款）", pct: 40, amount_cents: t2, due: due2 },
    { label: "最终交付验收（尾款）", pct: 30, amount_cents: t3, due: due3 },
  ];

  return {
    project_id: pkg.project_id ?? null,
    solution_package_id: pkg.id,
    scope_included,
    scope_excluded,
    assumptions,
    deliverables,
    timeline_weeks,
    price_cents,
    payment_milestones,
    customer_approval_status: "pending",
  };
}
