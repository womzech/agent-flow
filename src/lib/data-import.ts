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

export interface DataQualitySummary {
  totalRows: number;
  totalColumns: number;
  duplicateRows: number;
  missingCellsTotal: number;
  missingCellsPct: number;
  columns: ColumnInfo[];
  slaViolations: SLAViolation[];
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

/** Full quality analysis pipeline: parse → infer → analyze → recommend. */
export function analyzeQuality(headers: string[], rows: Record<string, string>[]): DataQualitySummary {
  const columns = inferColumns(headers, rows);
  const slaViolations = detectSLAViolations(headers, rows, columns);
  const duplicateRows = countDuplicateRows(rows);

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

  const suggestedTemplates = suggestTemplates(columns, slaViolations, issues);

  return {
    totalRows: rows.length,
    totalColumns: headers.length,
    duplicateRows,
    missingCellsTotal,
    missingCellsPct,
    columns,
    slaViolations,
    issues,
    recommendations,
    suggestedTemplates,
  };
}

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
