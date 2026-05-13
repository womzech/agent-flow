import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { clientsRepo, deliverablesRepo, projectsRepo, ticketsRepo } from "@/lib/repo";
import { PROJECT_STATUS_LABELS } from "@/lib/schema";
import { fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function ProjectsListPage() {
  const projects = projectsRepo.list();
  const clients = clientsRepo.list();
  const clientName = (id: number | null) => (id ? clients.find((c) => c.id === id)?.company ?? "—" : "—");
  const deliverableCount = (pid: number) => deliverablesRepo.list(pid).length;
  const openTickets = (pid: number) => ticketsRepo.list(pid).filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="项目工作区"
        description="每个项目=一份诊断+一份蓝图+若干交付物+工单+收入记录。"
      />
      {projects.length === 0 ? (
        <EmptyState
          title="还没有项目"
          description="从诊断报告的「转项目」按钮创建第一个项目"
          action={<Link href="/diagnostics" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">去诊断页面</Link>}
        />
      ) : (
        <Card className="divide-y divide-forge-line/60 p-0">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-forge-line/30 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-medium text-ink-50">{p.name}</div>
                <div className="mt-0.5 text-xs text-forge-muted">客户：{clientName(p.client_id)} · 启动 {fmtDate(p.started_at)}</div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <Pill tone={p.status === "pilot" ? "accent" : p.status === "retainer" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Pill>
                <span className="text-forge-muted">交付物 {deliverableCount(p.id)} · 待办工单 {openTickets(p.id)}</span>
                <span className="text-ink-100">{fmtCents(p.project_fee_cents)} · 月 {fmtCents(p.monthly_fee_cents)}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
