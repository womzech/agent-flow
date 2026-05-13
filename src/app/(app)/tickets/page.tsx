import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requirePermission } from "@/lib/current-user";
import { projectsRepo, ticketsRepo } from "@/lib/repo";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  await requirePermission("read", "tickets");
  const tickets = ticketsRepo.list();
  const projects = projectsRepo.list();
  const projectName = (id: number | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "—");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="工单 Tickets" description="全部项目的客户反馈与维护任务汇总。" />
      {tickets.length === 0 ? (
        <EmptyState title="没有工单" description="客户反馈和月度维护任务会出现在这里" />
      ) : (
        <Card className="divide-y divide-forge-line/60 p-0">
          {tickets.map((t) => (
            <Link key={t.id} href={`/projects/${t.project_id}`} className="flex items-start justify-between px-5 py-3 hover:bg-forge-line/30">
              <div>
                <div className="text-sm font-medium text-ink-50">{t.title}</div>
                <div className="text-xs text-forge-muted">{projectName(t.project_id)} · {fmtDate(t.opened_at)} · 优先级 {t.priority}</div>
              </div>
              <Pill tone={t.status === "open" ? "warning" : t.status === "closed" || t.status === "resolved" ? "success" : "accent"}>{t.status}</Pill>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
