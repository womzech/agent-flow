import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type {
  DiagnosticStatus,
  LeadSource,
  LeadStage,
  ProjectStatus,
  RevenueKind,
  TicketPriority,
  TicketStatus,
} from "./schema";

/** Row shapes — kept in sync with schema.ts. */

export interface Lead {
  id: number;
  name: string;
  company: string;
  industry: string;
  contact: string;
  source: LeadSource;
  stage: LeadStage;
  pain_points: string;
  budget_note: string;
  next_action: string;
  client_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  company: string;
  industry: string;
  size: string;
  contact: string;
  billing_email: string;
  notes: string;
  created_at: string;
}

export interface Diagnostic {
  id: number;
  lead_id: number | null;
  client_id: number | null;
  title: string;
  questionnaire_json: string;
  report_markdown: string;
  pricing_quote_cents: number;
  monthly_quote_cents: number;
  recommended_templates: string;
  status: DiagnosticStatus;
  share_token: string | null;
  generated_at: string | null;
  model_used: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  client_id: number | null;
  diagnostic_id: number | null;
  name: string;
  status: ProjectStatus;
  project_fee_cents: number;
  monthly_fee_cents: number;
  started_at: string;
  expected_handover_at: string | null;
  handed_over_at: string | null;
  notes: string;
  created_at: string;
}

export interface Blueprint {
  id: number;
  project_id: number | null;
  name: string;
  spec_json: string;
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: number;
  project_id: number;
  template_slug: string;
  params_json: string;
  bundle_path: string | null;
  bundle_size_bytes: number | null;
  delivered_at: string | null;
  notes: string;
  created_at: string;
}

export interface Ticket {
  id: number;
  project_id: number | null;
  title: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  opened_at: string;
  closed_at: string | null;
}

export interface RevenueRow {
  id: number;
  project_id: number | null;
  client_id: number | null;
  kind: RevenueKind;
  amount_cents: number;
  paid_at: string;
  memo: string;
}

/* ---------- Leads ---------- */

export const leadsRepo = {
  list(opts?: { q?: string; stage?: LeadStage; source?: LeadSource }): Lead[] {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts?.q) {
      conds.push("(name LIKE ? OR company LIKE ? OR industry LIKE ? OR pain_points LIKE ? OR contact LIKE ?)");
      const like = `%${opts.q}%`;
      params.push(like, like, like, like, like);
    }
    if (opts?.stage) { conds.push("stage = ?"); params.push(opts.stage); }
    if (opts?.source) { conds.push("source = ?"); params.push(opts.source); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return getDb().prepare(`SELECT * FROM leads ${where} ORDER BY updated_at DESC, id DESC`).all(...params) as Lead[];
  },
  get(id: number): Lead | undefined {
    return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead | undefined;
  },
  create(input: Omit<Lead, "id" | "created_at" | "updated_at" | "client_id"> & { client_id?: number | null }): Lead {
    const stmt = getDb().prepare(
      `INSERT INTO leads (name, company, industry, contact, source, stage, pain_points, budget_note, next_action, client_id)
       VALUES (@name, @company, @industry, @contact, @source, @stage, @pain_points, @budget_note, @next_action, @client_id)`,
    );
    const info = stmt.run({ client_id: null, ...input });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<Omit<Lead, "id" | "created_at">>): Lead | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next: Lead = { ...current, ...patch, updated_at: new Date().toISOString().replace("T", " ").slice(0, 19) };
    getDb()
      .prepare(
        `UPDATE leads SET name=@name, company=@company, industry=@industry, contact=@contact, source=@source,
         stage=@stage, pain_points=@pain_points, budget_note=@budget_note, next_action=@next_action,
         client_id=@client_id, updated_at=@updated_at WHERE id=@id`,
      )
      .run(next);
    return next;
  },
  countByStage(): Record<LeadStage, number> {
    const rows = getDb()
      .prepare("SELECT stage, COUNT(*) AS c FROM leads GROUP BY stage")
      .all() as { stage: LeadStage; c: number }[];
    const acc = { lead: 0, contacted: 0, diagnosing: 0, quoted: 0, piloting: 0, retainer: 0, lost: 0 } as Record<LeadStage, number>;
    for (const r of rows) acc[r.stage] = r.c;
    return acc;
  },
};

/* ---------- Clients ---------- */

export const clientsRepo = {
  list(opts?: { q?: string }): Client[] {
    if (opts?.q) {
      const like = `%${opts.q}%`;
      return getDb().prepare(
        `SELECT * FROM clients WHERE name LIKE ? OR company LIKE ? OR industry LIKE ? OR contact LIKE ? OR notes LIKE ?
         ORDER BY created_at DESC, id DESC`,
      ).all(like, like, like, like, like) as Client[];
    }
    return getDb().prepare("SELECT * FROM clients ORDER BY created_at DESC, id DESC").all() as Client[];
  },
  get(id: number): Client | undefined {
    return getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as Client | undefined;
  },
  create(input: Omit<Client, "id" | "created_at">): Client {
    const info = getDb()
      .prepare(
        `INSERT INTO clients (name, company, industry, size, contact, billing_email, notes)
         VALUES (@name, @company, @industry, @size, @contact, @billing_email, @notes)`,
      )
      .run(input);
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<Omit<Client, "id" | "created_at">>): Client | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb()
      .prepare(
        `UPDATE clients SET name=@name, company=@company, industry=@industry, size=@size,
         contact=@contact, billing_email=@billing_email, notes=@notes WHERE id=@id`,
      )
      .run(next);
    return next;
  },
};

/* ---------- Diagnostics ---------- */

export const diagnosticsRepo = {
  list(): Diagnostic[] {
    return getDb().prepare("SELECT * FROM diagnostics ORDER BY updated_at DESC, id DESC").all() as Diagnostic[];
  },
  get(id: number): Diagnostic | undefined {
    return getDb().prepare("SELECT * FROM diagnostics WHERE id = ?").get(id) as Diagnostic | undefined;
  },
  getByShareToken(token: string): Diagnostic | undefined {
    return getDb().prepare("SELECT * FROM diagnostics WHERE share_token = ?").get(token) as Diagnostic | undefined;
  },
  create(input: {
    lead_id?: number | null;
    client_id?: number | null;
    title: string;
    questionnaire: unknown;
  }): Diagnostic {
    const info = getDb()
      .prepare(
        `INSERT INTO diagnostics (lead_id, client_id, title, questionnaire_json, status)
         VALUES (@lead_id, @client_id, @title, @questionnaire_json, 'draft')`,
      )
      .run({
        lead_id: input.lead_id ?? null,
        client_id: input.client_id ?? null,
        title: input.title,
        questionnaire_json: JSON.stringify(input.questionnaire),
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(
    id: number,
    patch: Partial<{
      report_markdown: string;
      pricing_quote_cents: number;
      monthly_quote_cents: number;
      recommended_templates: string[];
      status: DiagnosticStatus;
      generated_at: string;
      model_used: string;
      share_token: string | null;
    }>,
  ): Diagnostic | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next: Diagnostic = {
      ...current,
      ...("report_markdown" in patch ? { report_markdown: patch.report_markdown! } : {}),
      ...("pricing_quote_cents" in patch ? { pricing_quote_cents: patch.pricing_quote_cents! } : {}),
      ...("monthly_quote_cents" in patch ? { monthly_quote_cents: patch.monthly_quote_cents! } : {}),
      ...("recommended_templates" in patch ? { recommended_templates: JSON.stringify(patch.recommended_templates!) } : {}),
      ...("status" in patch ? { status: patch.status! } : {}),
      ...("generated_at" in patch ? { generated_at: patch.generated_at! } : {}),
      ...("model_used" in patch ? { model_used: patch.model_used! } : {}),
      ...("share_token" in patch ? { share_token: patch.share_token! } : {}),
      updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    };
    getDb()
      .prepare(
        `UPDATE diagnostics SET report_markdown=@report_markdown,
         pricing_quote_cents=@pricing_quote_cents, monthly_quote_cents=@monthly_quote_cents,
         recommended_templates=@recommended_templates, status=@status,
         generated_at=@generated_at, model_used=@model_used, share_token=@share_token,
         updated_at=@updated_at WHERE id=@id`,
      )
      .run(next);
    return next;
  },
  ensureShareToken(id: number): string {
    const current = this.get(id);
    if (!current) throw new Error(`diagnostic ${id} not found`);
    if (current.share_token) return current.share_token;
    const token = randomUUID();
    this.update(id, { share_token: token });
    return token;
  },
  recommendedTemplates(d: Diagnostic): string[] {
    try {
      return JSON.parse(d.recommended_templates || "[]");
    } catch {
      return [];
    }
  },
  parseQuestionnaire(d: Diagnostic): Record<string, unknown> {
    try {
      return JSON.parse(d.questionnaire_json);
    } catch {
      return {};
    }
  },
};

/* ---------- Projects ---------- */

export const projectsRepo = {
  list(): Project[] {
    return getDb().prepare("SELECT * FROM projects ORDER BY started_at DESC, id DESC").all() as Project[];
  },
  get(id: number): Project | undefined {
    return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
  },
  create(input: Omit<Project, "id" | "created_at" | "started_at" | "expected_handover_at" | "handed_over_at"> & {
    started_at?: string;
    expected_handover_at?: string | null;
  }): Project {
    const info = getDb()
      .prepare(
        `INSERT INTO projects (client_id, diagnostic_id, name, status, project_fee_cents, monthly_fee_cents, started_at, expected_handover_at, notes)
         VALUES (@client_id, @diagnostic_id, @name, @status, @project_fee_cents, @monthly_fee_cents, COALESCE(@started_at, datetime('now')), @expected_handover_at, @notes)`,
      )
      .run({
        ...input,
        started_at: input.started_at ?? null,
        expected_handover_at: input.expected_handover_at ?? null,
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  update(id: number, patch: Partial<Project>): Project | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb()
      .prepare(
        `UPDATE projects SET client_id=@client_id, diagnostic_id=@diagnostic_id, name=@name, status=@status,
         project_fee_cents=@project_fee_cents, monthly_fee_cents=@monthly_fee_cents, started_at=@started_at,
         expected_handover_at=@expected_handover_at, handed_over_at=@handed_over_at, notes=@notes WHERE id=@id`,
      )
      .run(next);
    return next;
  },
};

/* ---------- Blueprints ---------- */

export const blueprintsRepo = {
  list(projectId?: number): Blueprint[] {
    if (typeof projectId === "number") {
      return getDb().prepare("SELECT * FROM blueprints WHERE project_id = ? ORDER BY updated_at DESC").all(projectId) as Blueprint[];
    }
    return getDb().prepare("SELECT * FROM blueprints ORDER BY updated_at DESC").all() as Blueprint[];
  },
  get(id: number): Blueprint | undefined {
    return getDb().prepare("SELECT * FROM blueprints WHERE id = ?").get(id) as Blueprint | undefined;
  },
  create(input: { project_id?: number | null; name: string; spec: unknown }): Blueprint {
    const info = getDb()
      .prepare(`INSERT INTO blueprints (project_id, name, spec_json) VALUES (@project_id, @name, @spec_json)`)
      .run({
        project_id: input.project_id ?? null,
        name: input.name,
        spec_json: JSON.stringify(input.spec),
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  updateSpec(id: number, spec: unknown, name?: string): Blueprint | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const updated_at = new Date().toISOString().replace("T", " ").slice(0, 19);
    getDb()
      .prepare(`UPDATE blueprints SET spec_json=?, name=COALESCE(?, name), updated_at=? WHERE id=?`)
      .run(JSON.stringify(spec), name ?? null, updated_at, id);
    return this.get(id);
  },
};

/* ---------- Deliverables ---------- */

export const deliverablesRepo = {
  list(projectId?: number): Deliverable[] {
    if (typeof projectId === "number") {
      return getDb().prepare("SELECT * FROM deliverables WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Deliverable[];
    }
    return getDb().prepare("SELECT * FROM deliverables ORDER BY created_at DESC").all() as Deliverable[];
  },
  get(id: number): Deliverable | undefined {
    return getDb().prepare("SELECT * FROM deliverables WHERE id = ?").get(id) as Deliverable | undefined;
  },
  create(input: { project_id: number; template_slug: string; params: unknown; notes?: string }): Deliverable {
    const info = getDb()
      .prepare(`INSERT INTO deliverables (project_id, template_slug, params_json, notes) VALUES (@project_id, @template_slug, @params_json, @notes)`)
      .run({
        project_id: input.project_id,
        template_slug: input.template_slug,
        params_json: JSON.stringify(input.params),
        notes: input.notes ?? "",
      });
    return this.get(Number(info.lastInsertRowid))!;
  },
  markBundled(id: number, bundle_path: string, bundle_size_bytes: number) {
    getDb()
      .prepare(`UPDATE deliverables SET bundle_path=?, bundle_size_bytes=?, delivered_at=datetime('now') WHERE id=?`)
      .run(bundle_path, bundle_size_bytes, id);
    return this.get(id);
  },
  parseParams(d: Deliverable): Record<string, unknown> {
    try {
      return JSON.parse(d.params_json);
    } catch {
      return {};
    }
  },
};

/* ---------- Tickets ---------- */

export const ticketsRepo = {
  list(projectId?: number): Ticket[] {
    if (typeof projectId === "number") {
      return getDb().prepare("SELECT * FROM tickets WHERE project_id = ? ORDER BY opened_at DESC").all(projectId) as Ticket[];
    }
    return getDb().prepare("SELECT * FROM tickets ORDER BY opened_at DESC").all() as Ticket[];
  },
  create(input: { project_id?: number | null; title: string; body?: string; priority?: TicketPriority }): Ticket {
    const info = getDb()
      .prepare(`INSERT INTO tickets (project_id, title, body, priority) VALUES (@project_id, @title, @body, @priority)`)
      .run({
        project_id: input.project_id ?? null,
        title: input.title,
        body: input.body ?? "",
        priority: input.priority ?? "normal",
      });
    return getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(Number(info.lastInsertRowid)) as Ticket;
  },
  setStatus(id: number, status: TicketStatus) {
    const closed_at = status === "closed" || status === "resolved" ? new Date().toISOString().replace("T", " ").slice(0, 19) : null;
    getDb().prepare(`UPDATE tickets SET status=?, closed_at=? WHERE id=?`).run(status, closed_at, id);
  },
};

/* ---------- Revenue ---------- */

export const revenueRepo = {
  list(): RevenueRow[] {
    return getDb().prepare("SELECT * FROM revenue_log ORDER BY paid_at DESC").all() as RevenueRow[];
  },
  add(input: { project_id?: number | null; client_id?: number | null; kind: RevenueKind; amount_cents: number; memo?: string; paid_at?: string }) {
    const info = getDb()
      .prepare(`INSERT INTO revenue_log (project_id, client_id, kind, amount_cents, memo, paid_at)
        VALUES (@project_id, @client_id, @kind, @amount_cents, @memo, COALESCE(@paid_at, datetime('now')))`)
      .run({
        project_id: input.project_id ?? null,
        client_id: input.client_id ?? null,
        kind: input.kind,
        amount_cents: input.amount_cents,
        memo: input.memo ?? "",
        paid_at: input.paid_at ?? null,
      });
    return Number(info.lastInsertRowid);
  },
  monthTotalCents(yyyymm: string): number {
    const row = getDb().prepare(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM revenue_log WHERE substr(paid_at,1,7)=?`).get(yyyymm) as { s: number };
    return row.s;
  },
  monthMrrCents(yyyymm: string): number {
    const row = getDb()
      .prepare(`SELECT COALESCE(SUM(amount_cents),0) AS s FROM revenue_log WHERE kind='monthly' AND substr(paid_at,1,7)=?`)
      .get(yyyymm) as { s: number };
    return row.s;
  },
};

/* ---------- Settings ---------- */

export const settingsRepo = {
  get(key: string): string | undefined {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  },
  set(key: string, value: string) {
    getDb().prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, value);
  },
  all(): Record<string, string> {
    const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
