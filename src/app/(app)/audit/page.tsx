import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { appliedMigrations } from "@/lib/db";
import { countAll, list, type AuditEvent } from "@/lib/audit";
import type { AuditAction } from "@/lib/schema";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const actionTone: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  "auth.fail": "danger",
  "auth.login": "success",
  "auth.logout": "neutral",
  "diagnostic.generate": "accent",
  "deliverable.bundle": "accent",
  "deliverable.download": "warning",
  "export.csv": "warning",
  "export.json": "warning",
};

export default function AuditPage({ searchParams }: { searchParams: { entity?: string; action?: string; entity_id?: string } }) {
  const events: AuditEvent[] = list({
    entity: searchParams.entity || undefined,
    entityId: searchParams.entity_id ? Number(searchParams.entity_id) : undefined,
    action: (searchParams.action as AuditAction) || undefined,
    limit: 200,
  });
  const total = countAll();
  const migrations = appliedMigrations();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="审计日志 Audit Log"
        description={`累计 ${total} 条事件 · 仅显示最近 200 条。所有关键状态变更和导出都会被记录。`}
      />

      <Card className="mb-4">
        <div className="text-xs uppercase tracking-wider text-forge-muted">Schema migrations</div>
        <ul className="mt-2 grid gap-1 md:grid-cols-3">
          {migrations.map((m) => (
            <li key={m.version} className="flex items-center gap-2 text-sm">
              <Pill tone="success">v{m.version}</Pill>
              <span className="text-forge-muted">{fmtDate(m.applied_at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {events.length === 0 ? (
        <EmptyState title="没有审计事件" description="进行任意写操作后，事件会显示在这里。" />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                <th className="p-3">时间</th>
                <th className="p-3">操作</th>
                <th className="p-3">实体</th>
                <th className="p-3">ID</th>
                <th className="p-3">细节</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-forge-line/40">
                  <td className="p-3 text-forge-muted">{fmtDate(e.at)}</td>
                  <td className="p-3"><Pill tone={actionTone[e.action] || "neutral"}>{e.action}</Pill></td>
                  <td className="p-3 text-ink-100">{e.entity}</td>
                  <td className="p-3 text-forge-muted">{e.entity_id ?? "—"}</td>
                  <td className="p-3 text-ink-200">
                    <code className="text-xs text-forge-muted">{e.payload_json.length > 80 ? `${e.payload_json.slice(0, 80)}…` : e.payload_json}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
