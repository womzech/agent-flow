import { notFound } from "next/navigation";
import Link from "next/link";
import { businessDataImportsRepo } from "@/lib/delivery-os";
import type { ColumnInfo, DataQualitySummary } from "@/lib/data-import";
import { PII_LABELS } from "@/lib/data-import";
import { Card, CardHeader, CardTitle, CardDescription, Pill, Button } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import GeneratePackageButton from "./generate-package-button";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  id: "标识符",
  text: "文本",
  numeric: "数值",
  date: "日期",
  status: "状态",
  category: "分类",
  unknown: "未知",
};

const TYPE_TONES: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  id: "neutral",
  text: "neutral",
  numeric: "accent",
  date: "accent",
  status: "warning",
  category: "warning",
  unknown: "neutral",
};

export default async function DataImportDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const imp = businessDataImportsRepo.get(id);
  if (!imp) notFound();

  const summary: DataQualitySummary = JSON.parse(imp.data_quality_summary || "{}");
  const columns: ColumnInfo[] = JSON.parse(imp.inferred_schema || "[]");
  const sampleRows: Record<string, string>[] = JSON.parse(imp.sample_rows || "[]");
  const originalColumns: string[] = JSON.parse(imp.original_columns || "[]");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-forge-muted">
        {["数据导入", "诊断", "方案", "报价/SOW", "客户确认", "验收"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span className={i === 0 ? "font-semibold text-accent-300" : ""}>{s}</span>
          </span>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-50">{imp.filename}</h1>
          <p className="mt-1 text-sm text-forge-muted">
            {imp.row_count} 行 · {originalColumns.length} 列 · {fmtDate(imp.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <GeneratePackageButton dataImportId={id} projectId={imp.project_id} />
          <Link href="/data-imports/new">
            <Button variant="secondary" size="sm">新建导入</Button>
          </Link>
        </div>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "总行数", value: String(summary.totalRows ?? imp.row_count) },
          { label: "总列数", value: String(summary.totalColumns ?? originalColumns.length) },
          { label: "重复行", value: String(summary.duplicateRows ?? 0) },
          { label: "整体缺失率", value: `${summary.missingCellsPct ?? 0}%` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <div className="text-xs uppercase tracking-wider text-forge-muted">{label}</div>
            <div className="mt-1 text-xl font-semibold text-ink-50">{value}</div>
          </Card>
        ))}
      </div>

      {/* PII flags — surfaced prominently for compliance reviewers */}
      {(summary.piiFlags ?? []).length > 0 && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardHeader>
            <CardTitle>⚠ 个人信息（PII）检测</CardTitle>
            <Pill tone="danger">{summary.piiFlags.length} 个字段</Pill>
          </CardHeader>
          <p className="mb-3 text-xs text-rose-200">
            上传到云端 LLM（含本系统调用的 Anthropic）前请脱敏；按 PIPL 最小化收集原则评估是否必须保留这些字段。
          </p>
          <div className="space-y-2">
            {summary.piiFlags.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-forge p-3 text-sm">
                <div>
                  <span className="font-medium text-ink-100">{f.column}</span>
                  <span className="ml-2 text-rose-300">{PII_LABELS[f.kind] ?? f.kind}</span>
                  <span className="ml-2 text-forge-muted">样例：{f.redactedSamples.join(" / ")}</span>
                </div>
                <Pill tone="warning">{f.matchCount} 条</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Issues */}
      {(summary.issues ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>发现问题</CardTitle>
            <Pill tone="danger">{summary.issues.length} 项</Pill>
          </CardHeader>
          <ul className="space-y-1.5">
            {summary.issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-rose-400">✕</span>
                {issue}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* SLA Violations */}
      {(summary.slaViolations ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>SLA 违规</CardTitle>
            <Pill tone="warning">{summary.slaViolations.length} 字段</Pill>
          </CardHeader>
          <div className="space-y-2">
            {summary.slaViolations.map((v, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-forge p-3 text-sm">
                <div>
                  <span className="font-medium text-ink-100">{v.column}</span>
                  <span className="ml-2 text-forge-muted">超出 {v.threshold}h 阈值</span>
                </div>
                <Pill tone="danger">{v.violationCount} 条 ({v.violationPct}%)</Pill>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommendations */}
      {(summary.recommendations ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>优化建议</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {summary.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-accent-400">→</span>
                {rec}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Suggested Templates */}
      {(summary.suggestedTemplates ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>推荐模板</CardTitle>
            <CardDescription>基于数据特征自动识别</CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            {summary.suggestedTemplates.map((slug) => (
              <Link key={slug} href={`/templates/${slug}`}>
                <span className="rounded-md border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-sm text-accent-300 hover:bg-accent-500/20 transition">
                  {slug}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Column Schema */}
      <Card>
        <CardHeader>
          <CardTitle>字段分析</CardTitle>
          <CardDescription>{columns.length} 个字段</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forge-line text-left text-xs text-forge-muted">
                <th className="pb-2 pr-4 font-medium">字段名</th>
                <th className="pb-2 pr-4 font-medium">类型</th>
                <th className="pb-2 pr-4 font-medium">缺失率</th>
                <th className="pb-2 pr-4 font-medium">唯一值</th>
                <th className="pb-2 font-medium">样例值</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forge-line/40">
              {columns.map((col) => (
                <tr key={col.name}>
                  <td className="py-2 pr-4 font-mono text-ink-100">{col.name}</td>
                  <td className="py-2 pr-4">
                    <Pill tone={TYPE_TONES[col.type] ?? "neutral"}>{TYPE_LABELS[col.type] ?? col.type}</Pill>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={col.missingPct > 0.2 ? "text-rose-400" : col.missingPct > 0.05 ? "text-amber-400" : "text-emerald-400"}>
                      {Math.round(col.missingPct * 100)}%
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-forge-muted">{col.uniqueCount}</td>
                  <td className="py-2 max-w-xs truncate text-forge-muted text-xs">
                    {col.sampleValues.slice(0, 4).join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sample Rows */}
      {sampleRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>数据预览</CardTitle>
            <CardDescription>前 {sampleRows.length} 行</CardDescription>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-forge-line text-left text-forge-muted">
                  {originalColumns.map((col) => (
                    <th key={col} className="pb-2 pr-3 font-medium whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-forge-line/30">
                {sampleRows.map((row, i) => (
                  <tr key={i}>
                    {originalColumns.map((col) => (
                      <td key={col} className="py-1.5 pr-3 text-ink-200 whitespace-nowrap max-w-[120px] truncate">
                        {row[col] || <span className="text-forge-muted italic">空</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
