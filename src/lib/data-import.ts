/**
 * CSV parsing and data quality analysis for the Delivery OS data import flow.
 * Zero external dependencies — plain TypeScript only.
 */

export interface ColumnInfo {
  name: string;
  type: "id" | "text" | "numeric" | "date" | "status" | "category" | "unknown";
  missingCount: number;
  missingPct: number;
  uniqueCount: number;
  sampleValues: string[];
  numericStats?: { min: number; max: number; mean: number };
}

export interface SLAViolation {
  column: string;
  threshold: number;
  violationCount: number;
  violationPct: number;
}

export type PiiKind = "id_card_cn" | "phone_cn" | "email" | "bank_card" | "passport";

export interface PiiFlag {
  column: string;
  kind: PiiKind;
  /** Number of rows in this column matching the PII pattern. */
  matchCount: number;
  /** Up to 2 redacted sample cell preview ("110***********34") for the UI to show. */
  redactedSamples: string[];
}

export interface DataQualitySummary {
  totalRows: number;
  totalColumns: number;
  duplicateRows: number;
  missingCellsTotal: number;
  missingCellsPct: number;
  columns: ColumnInfo[];
  slaViolations: SLAViolation[];
  /** Per-column PII detection. Empty array means no PII detected. */
  piiFlags: PiiFlag[];
  issues: string[];
  recommendations: string[];
  suggestedTemplates: string[];
}

/** Parse a raw CSV string into headers + rows. Handles quoted fields. */
export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? "").trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/** Infer column types and compute per-column statistics. */
export function inferColumns(headers: string[], rows: Record<string, string>[]): ColumnInfo[] {
  return headers.map((name) => {
    const values = rows.map((r) => r[name] ?? "");
    const nonEmpty = values.filter((v) => v !== "");
    const missingCount = values.length - nonEmpty.length;
    const missingPct = values.length > 0 ? missingCount / values.length : 0;
    const unique = new Set(nonEmpty);
    const uniqueCount = unique.size;
    const sampleValues = Array.from(unique).slice(0, 8);

    const type = inferColumnType(name, nonEmpty, uniqueCount);
    const numericStats = type === "numeric" ? computeNumericStats(nonEmpty) : undefined;

    return { name, type, missingCount, missingPct, uniqueCount, sampleValues, numericStats };
  });
}

function inferColumnType(name: string, nonEmpty: string[], uniqueCount: number): ColumnInfo["type"] {
  const lower = name.toLowerCase();

  // ID columns: named *_id, id, *no, *number
  if (/^(id|.*_id|ticket_?id|order_?id|ref|编号|工单号)$/i.test(lower)) return "id";

  // Date columns: named *date, *time, *at, *_dt
  if (/date|time|_at|_dt|创建|更新|时间|日期/.test(lower)) {
    if (nonEmpty.length > 0 && looksLikeDate(nonEmpty[0])) return "date";
  }

  // Numeric columns
  if (nonEmpty.length > 0) {
    const numericFrac = nonEmpty.filter(isNumericString).length / nonEmpty.length;
    if (numericFrac >= 0.8) return "numeric";
  }

  // Status / priority columns (small distinct + known keywords)
  const statusKeywords = /(status|stage|state|priority|级别|状态|优先|等级)/i;
  if (statusKeywords.test(lower) && uniqueCount <= 10) return "status";

  // Category columns: few distinct values relative to total
  if (uniqueCount > 0 && uniqueCount <= 15 && nonEmpty.length >= uniqueCount * 2) return "category";

  return "text";
}

function looksLikeDate(s: string): boolean {
  return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) || /^\d{4}-\d{2}-\d{2}T/.test(s);
}

function isNumericString(s: string): boolean {
  return s !== "" && !isNaN(Number(s));
}

function computeNumericStats(values: string[]): { min: number; max: number; mean: number } {
  const nums = values.filter(isNumericString).map(Number);
  if (nums.length === 0) return { min: 0, max: 0, mean: 0 };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return { min, max, mean: Math.round(mean * 100) / 100 };
}

/** SLA thresholds for common column name patterns. */
const SLA_THRESHOLDS: Array<{ pattern: RegExp; threshold: number; label: string }> = [
  { pattern: /response_time/i, threshold: 4, label: "首次响应 SLA (4小时)" },
  { pattern: /resolution_time/i, threshold: 24, label: "解决时长 SLA (24小时)" },
  { pattern: /reply_time/i, threshold: 2, label: "回复时长 SLA (2小时)" },
];

function detectSLAViolations(
  headers: string[],
  rows: Record<string, string>[],
  columns: ColumnInfo[],
): SLAViolation[] {
  const violations: SLAViolation[] = [];
  for (const col of columns) {
    if (col.type !== "numeric") continue;
    for (const sla of SLA_THRESHOLDS) {
      if (!sla.pattern.test(col.name)) continue;
      const vals = rows.map((r) => r[col.name]).filter((v) => v !== "" && isNumericString(v)).map(Number);
      if (vals.length === 0) continue;
      const violated = vals.filter((v) => v > sla.threshold);
      if (violated.length > 0) {
        violations.push({
          column: col.name,
          threshold: sla.threshold,
          violationCount: violated.length,
          violationPct: Math.round((violated.length / vals.length) * 100),
        });
      }
    }
  }
  return violations;
}

function countDuplicateRows(rows: Record<string, string>[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) dupes++;
    else seen.add(key);
  }
  return dupes;
}

/**
 * Detect Chinese-context PII in uploaded data. Regex-only — no LLM call needed,
 * conservative thresholds (>= 2 matches in a column before flagging). The aim
 * is to warn the consultant, not to block. The customer ultimately decides
 * whether to upload after redaction.
 */
const PII_RULES: { kind: PiiKind; pattern: RegExp; minLen?: number }[] = [
  // 18-digit mainland ID card (last char may be X)
  { kind: "id_card_cn", pattern: /^\s*[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\s*$/ },
  // Mainland mobile: 11 digits starting with 1, second digit 3-9
  { kind: "phone_cn", pattern: /^\s*(?:\+?86[\s-]?)?1[3-9]\d{9}\s*$/ },
  // Email
  { kind: "email", pattern: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/ },
  // Bank card: 13-19 digits (loose) — pair with column-name heuristic to cut noise
  { kind: "bank_card", pattern: /^\s*\d{13,19}\s*$/, minLen: 13 },
  // Passport: 1 letter + 8-9 digits, common formats for CN/HK/Macao
  { kind: "passport", pattern: /^\s*[A-Z]\d{7,9}\s*$/i },
];

function looksBankCardColumn(name: string): boolean {
  return /(?:card|account|bank|银行|卡号|账号|账户)/i.test(name);
}

export function detectPii(headers: string[], rows: Record<string, string>[]): PiiFlag[] {
  const flags: PiiFlag[] = [];
  for (const header of headers) {
    for (const rule of PII_RULES) {
      // bank_card is generic numeric — only flag if column name hints at it.
      if (rule.kind === "bank_card" && !looksBankCardColumn(header)) continue;
      let matchCount = 0;
      const samples: string[] = [];
      for (const row of rows) {
        const v = row[header];
        if (v && rule.pattern.test(v)) {
          matchCount++;
          if (samples.length < 2) samples.push(redactPii(v, rule.kind));
        }
      }
      if (matchCount >= 2) {
        flags.push({ column: header, kind: rule.kind, matchCount, redactedSamples: samples });
        break; // one kind per column max
      }
    }
  }
  return flags;
}

function redactPii(raw: string, kind: PiiKind): string {
  const v = raw.trim();
  if (kind === "email") {
    const at = v.indexOf("@");
    if (at < 2) return "***" + v.slice(at);
    return v.slice(0, 1) + "***" + v.slice(at);
  }
  if (v.length <= 4) return "****";
  return v.slice(0, 2) + "*".repeat(Math.max(3, v.length - 4)) + v.slice(-2);
}

/** Full quality analysis pipeline: parse → infer → analyze → recommend. */
export function analyzeQuality(headers: string[], rows: Record<string, string>[]): DataQualitySummary {
  const columns = inferColumns(headers, rows);
  const slaViolations = detectSLAViolations(headers, rows, columns);
  const duplicateRows = countDuplicateRows(rows);
  const piiFlags = detectPii(headers, rows);

  const missingCellsTotal = columns.reduce((s, c) => s + c.missingCount, 0);
  const totalCells = rows.length * headers.length;
  const missingCellsPct = totalCells > 0 ? Math.round((missingCellsTotal / totalCells) * 100) : 0;

  const issues: string[] = [];
  const recommendations: string[] = [];

  // Missing value issues
  for (const col of columns) {
    if (col.missingPct > 0.3) {
      issues.push(`字段「${col.name}」缺失率 ${Math.round(col.missingPct * 100)}%（${col.missingCount}/${rows.length} 行）`);
    }
  }

  // SLA violation issues
  for (const v of slaViolations) {
    issues.push(`字段「${v.column}」有 ${v.violationCount} 条记录（${v.violationPct}%）超出 ${v.threshold} 小时 SLA`);
  }

  // Duplicate row issues
  if (duplicateRows > 0) {
    issues.push(`发现 ${duplicateRows} 行重复数据`);
  }

  // Recommendations based on analysis
  const categoryColsWithMissing = columns.filter(
    (c) => (c.type === "category" || c.type === "status") && c.missingPct > 0.05,
  );
  if (categoryColsWithMissing.length > 0) {
    recommendations.push(
      `字段「${categoryColsWithMissing.map((c) => c.name).join("、")}」有缺失值，推荐引入 AI 自动分类模型补全`,
    );
  }

  if (slaViolations.length > 0) {
    recommendations.push("存在 SLA 违规，推荐引入智能路由与优先级自动升级机制");
  }

  if (duplicateRows > 0) {
    recommendations.push("存在重复行，推荐在数据接入环节加入去重与校验步骤");
  }

  const numericCols = columns.filter((c) => c.type === "numeric" && c.missingPct > 0.1);
  if (numericCols.length > 0) {
    recommendations.push(`数值字段「${numericCols.map((c) => c.name).join("、")}」有较多空值，推荐增加数据收集规范`);
  }

  // PII findings turn into issues + recommendations
  if (piiFlags.length > 0) {
    issues.push(
      `检测到 ${piiFlags.length} 个字段包含个人信息（PII）：${piiFlags.map((f) => `${f.column}(${PII_LABELS[f.kind]})`).join("、")}`,
    );
    recommendations.push(
      "上传到云端 LLM 前请先脱敏 / 加密；最小化收集（PIPL）原则下，仅保留业务流程必需字段",
    );
  }

  const suggestedTemplates = suggestTemplates(columns, slaViolations, issues);

  return {
    totalRows: rows.length,
    totalColumns: headers.length,
    duplicateRows,
    missingCellsTotal,
    missingCellsPct,
    columns,
    slaViolations,
    piiFlags,
    issues,
    recommendations,
    suggestedTemplates,
  };
}

export const PII_LABELS: Record<PiiKind, string> = {
  id_card_cn: "身份证号",
  phone_cn: "手机号",
  email: "邮箱",
  bank_card: "银行卡 / 账户号",
  passport: "护照号",
};

function suggestTemplates(
  columns: ColumnInfo[],
  slaViolations: SLAViolation[],
  issues: string[],
): string[] {
  const slugs: string[] = [];
  const names = columns.map((c) => c.name.toLowerCase());

  // Ticket / customer service data
  if (names.some((n) => /ticket|工单|subject|category|优先/.test(n))) {
    slugs.push("customer-service");
  }

  // Price / cost / supplier data
  if (names.some((n) => /price|cost|价格|报价|supplier/.test(n))) {
    slugs.push("price-monitor");
  }

  // Lead / contact data
  if (names.some((n) => /lead|contact|客户|线索|inquiry/.test(n))) {
    slugs.push("lead-intake");
    slugs.push("inquiry-reply");
  }

  // Document / knowledge base data
  if (names.some((n) => /doc|document|文档|知识|faq/.test(n))) {
    slugs.push("doc-qa-bot");
  }

  // Excel / batch data
  if (slaViolations.length > 0 || issues.some((i) => i.includes("缺失率"))) {
    if (!slugs.includes("excel-batch")) slugs.push("excel-batch");
  }

  return [...new Set(slugs)];
}

/**
 * Parse an Excel (.xlsx / .xls) file buffer into headers + rows.
 * Uses the first worksheet. All cell values are coerced to strings.
 */
export function parseExcel(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
  const XLSX = require("xlsx") as typeof import("xlsx"); // dynamic require — xlsx not in static imports to avoid SSR bundle cost
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length < 2) return { headers: [], rows: [] };

  const headers = (raw[0] as unknown[]).map((h) => String(h ?? "").trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i] as unknown[];
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = String(cells[j] ?? "").trim();
    }
    rows.push(row);
  }
  return { headers, rows };
}

/** Produce a human-readable data report summary string. */
export function formatQualitySummaryText(summary: DataQualitySummary): string {
  const parts: string[] = [];

  parts.push(`## 数据质量摘要\n`);
  parts.push(`- 总行数：${summary.totalRows}，总列数：${summary.totalColumns}`);
  if (summary.duplicateRows > 0) parts.push(`- 重复行：${summary.duplicateRows} 行`);
  parts.push(`- 整体缺失率：${summary.missingCellsPct}%`);

  if (summary.slaViolations.length > 0) {
    parts.push(`\n### SLA 违规`);
    for (const v of summary.slaViolations) {
      parts.push(`- ${v.column}：${v.violationCount} 条（${v.violationPct}%）超过 ${v.threshold}h`);
    }
  }

  if (summary.issues.length > 0) {
    parts.push(`\n### 发现问题`);
    for (const i of summary.issues) parts.push(`- ${i}`);
  }

  if (summary.recommendations.length > 0) {
    parts.push(`\n### 优化建议`);
    for (const r of summary.recommendations) parts.push(`- ${r}`);
  }

  return parts.join("\n");
}
