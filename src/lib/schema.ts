/**
 * Single source of truth for the AgentForge SQLite schema.
 *
 * CHANGELOG
 *  - v1 (2026-05-13): Initial schema (leads, clients, diagnostics, projects, blueprints,
 *    templates, deliverables, tickets, revenue_log).
 *  - v2 (2026-05-13): audit_log table + secondary indexes for hot queries.
 *    schema_migrations table tracks applied versions.
 */

export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS leads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  company       TEXT    NOT NULL,
  industry      TEXT    NOT NULL,
  contact       TEXT    NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'unknown',
  stage         TEXT    NOT NULL DEFAULT 'lead',
  pain_points   TEXT    NOT NULL DEFAULT '',
  budget_note   TEXT    NOT NULL DEFAULT '',
  next_action   TEXT    NOT NULL DEFAULT '',
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  company       TEXT    NOT NULL,
  industry      TEXT    NOT NULL,
  size          TEXT    NOT NULL DEFAULT 'unknown',
  contact       TEXT    NOT NULL,
  billing_email TEXT    NOT NULL DEFAULT '',
  notes         TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagnostics (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id             INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title               TEXT    NOT NULL,
  questionnaire_json  TEXT    NOT NULL,
  report_markdown     TEXT    NOT NULL DEFAULT '',
  pricing_quote_cents INTEGER NOT NULL DEFAULT 0,
  monthly_quote_cents INTEGER NOT NULL DEFAULT 0,
  recommended_templates TEXT  NOT NULL DEFAULT '[]',
  status              TEXT    NOT NULL DEFAULT 'draft',
  share_token         TEXT,
  generated_at        TEXT,
  model_used          TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_share_token ON diagnostics(share_token);

CREATE TABLE IF NOT EXISTS projects (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id           INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  diagnostic_id       INTEGER REFERENCES diagnostics(id) ON DELETE SET NULL,
  name                TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pilot',
  project_fee_cents   INTEGER NOT NULL DEFAULT 0,
  monthly_fee_cents   INTEGER NOT NULL DEFAULT 0,
  started_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  expected_handover_at TEXT,
  handed_over_at      TEXT,
  notes               TEXT    NOT NULL DEFAULT '',
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blueprints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  spec_json   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deliverables (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_slug   TEXT    NOT NULL,
  params_json     TEXT    NOT NULL DEFAULT '{}',
  bundle_path     TEXT,
  bundle_size_bytes INTEGER,
  delivered_at    TEXT,
  notes           TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'open',
  priority    TEXT    NOT NULL DEFAULT 'normal',
  opened_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS revenue_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  kind        TEXT    NOT NULL,
  amount_cents INTEGER NOT NULL,
  paid_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  memo        TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version  INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor         TEXT    NOT NULL DEFAULT 'system',
  action        TEXT    NOT NULL,
  entity        TEXT    NOT NULL,
  entity_id     INTEGER,
  payload_json  TEXT    NOT NULL DEFAULT '{}',
  at            TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at        ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity    ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage         ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_client_id     ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_diagnostics_status  ON diagnostics(status);
CREATE INDEX IF NOT EXISTS idx_diagnostics_lead    ON diagnostics(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_client     ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_proj   ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_proj_status ON tickets(project_id, status);
CREATE INDEX IF NOT EXISTS idx_revenue_paid_at     ON revenue_log(paid_at);
CREATE INDEX IF NOT EXISTS idx_revenue_project     ON revenue_log(project_id);
`;

/** Enums kept in TS-land for autocomplete + UI labels. */

export const LEAD_STAGES = ["lead", "contacted", "diagnosing", "quoted", "piloting", "retainer", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  lead: "新线索",
  contacted: "已联系",
  diagnosing: "诊断中",
  quoted: "已报价",
  piloting: "试点中",
  retainer: "月度维护",
  lost: "流失",
};

export const LEAD_SOURCES = ["wechat", "xiaohongshu", "douyin", "xianyu", "linkedin", "referral", "industry-group", "exhibition", "unknown"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  wechat: "朋友圈",
  xiaohongshu: "小红书",
  douyin: "抖音",
  xianyu: "闲鱼",
  linkedin: "LinkedIn",
  referral: "朋友介绍",
  "industry-group": "行业群",
  exhibition: "展会 / 线下",
  unknown: "未知",
};

export const PROJECT_STATUSES = ["pilot", "delivered", "retainer", "paused", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  pilot: "试点开发中",
  delivered: "已交付",
  retainer: "月度维护",
  paused: "暂停",
  archived: "已归档",
};

export const DIAGNOSTIC_STATUSES = ["draft", "generating", "ready", "shared", "converted"] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

export const DIAGNOSTIC_STATUS_LABELS: Record<DiagnosticStatus, string> = {
  draft: "草稿",
  generating: "生成中",
  ready: "已生成",
  shared: "已分享",
  converted: "已转项目",
};

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "待处理",
  in_progress: "处理中",
  resolved: "已解决",
  closed: "已关闭",
};

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const REVENUE_KINDS = ["diagnostic", "project", "monthly", "other"] as const;
export type RevenueKind = (typeof REVENUE_KINDS)[number];

export const REVENUE_KIND_LABELS: Record<RevenueKind, string> = {
  diagnostic: "诊断费",
  project: "项目款",
  monthly: "月费",
  other: "其他",
};

export const AUDIT_ACTIONS = [
  "lead.create", "lead.update", "lead.convert",
  "client.create", "client.update",
  "diagnostic.create", "diagnostic.generate", "diagnostic.share", "diagnostic.convert",
  "project.create", "project.update",
  "blueprint.create", "blueprint.update",
  "deliverable.create", "deliverable.update", "deliverable.bundle", "deliverable.download",
  "ticket.create", "ticket.update",
  "revenue.add",
  "auth.login", "auth.logout", "auth.fail",
  "export.csv", "export.json",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
