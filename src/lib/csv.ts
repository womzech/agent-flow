/**
 * RFC-4180 friendly CSV serializer. Stays minimal because all our exports are
 * tabular and ASCII-safe — except company / Chinese names, which UTF-8 BOM
 * fixes for Excel.
 */

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0 && !headers) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const head = cols.map(esc).join(",");
  const body = rows.map((r) => cols.map((c) => esc(stringify(r[c]))).join(",")).join("\n");
  // UTF-8 BOM ensures Excel detects encoding correctly.
  return "﻿" + head + "\n" + body + "\n";
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function esc(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
