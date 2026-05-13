import Link from "next/link";
import { Card, CardTitle, EmptyState, KPI, PageHeader, Pill, Section } from "@/components/ui";
import {
  diagnosticsRepo,
  leadsRepo,
  projectsRepo,
  revenueRepo,
  ticketsRepo,
} from "@/lib/repo";
import { LEAD_STAGE_LABELS, LEAD_STAGES, PROJECT_STATUS_LABELS, type LeadStage } from "@/lib/schema";
import { currentMonth, fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const month = currentMonth();
  const leads = leadsRepo.list();
  const projects = projectsRepo.list();
  const diagnostics = diagnosticsRepo.list();
  const tickets = ticketsRepo.list();
  const monthRevenue = revenueRepo.monthTotalCents(month);
  const monthMrr = revenueRepo.monthMrrCents(month);
  const counts = leadsRepo.countByStage();
  const activeProjects = projects.filter((p) => p.status === "pilot" || p.status === "retainer").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="工作台 Overview"
        description={`本月 (${month}) KPI 与销售管道速览。`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="本月收入" value={fmtCents(monthRevenue)} hint={`含一次性 + 月费`} />
        <KPI label="本月月费 MRR" value={fmtCents(monthMrr)} hint={`续费收入`} />
        <KPI label="活跃项目" value={String(activeProjects)} hint={`试点 + 维护中`} />
        <KPI label="新线索" value={String(leads.length)} hint={`累计；筛选见下方`} />
      </div>

      <Section title="销售管道 Pipeline" description="每个阶段的线索数量；点击进入看板。" action={<Link href="/leads" className="text-sm text-accent-400 hover:underline">看板视图 →</Link>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {LEAD_STAGES.map((stage) => (
            <Card key={stage} className="flex flex-col items-start gap-2">
              <Pill tone={stageTone(stage)}>{LEAD_STAGE_LABELS[stage]}</Pill>
              <div className="text-2xl font-semibold text-ink-50">{counts[stage]}</div>
              <div className="text-xs text-forge-muted">线索</div>
            </Card>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="最近诊断" description="最新 5 条诊断报告">
          {diagnostics.length === 0 ? (
            <EmptyState title="还没有诊断" description="新建一个诊断报告作为销售 hook（5000-10000 元/份）" />
          ) : (
            <Card className="divide-y divide-forge-line/60 p-0">
              {diagnostics.slice(0, 5).map((d) => (
                <Link key={d.id} href={`/diagnostics/${d.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-forge-line/30">
                  <div>
                    <div className="text-sm font-medium text-ink-50">{d.title}</div>
                    <div className="text-xs text-forge-muted">{fmtDate(d.updated_at)} · 状态 {d.status}</div>
                  </div>
                  <div className="text-right text-xs text-forge-muted">
                    <div>报价 {fmtCents(d.pricing_quote_cents)}</div>
                    <div>月费 {fmtCents(d.monthly_quote_cents)}</div>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </Section>

        <Section title="活跃项目" description="试点 / 维护中">
          {projects.length === 0 ? (
            <EmptyState title="还没有项目" description="从诊断报告转化的项目会出现在这里" />
          ) : (
            <Card className="divide-y divide-forge-line/60 p-0">
              {projects.slice(0, 5).map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-forge-line/30">
                  <div>
                    <div className="text-sm font-medium text-ink-50">{p.name}</div>
                    <div className="text-xs text-forge-muted">
                      <Pill tone={p.status === "pilot" ? "accent" : p.status === "retainer" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Pill>
                    </div>
                  </div>
                  <div className="text-right text-xs text-forge-muted">
                    <div>项目费 {fmtCents(p.project_fee_cents)}</div>
                    <div>月费 {fmtCents(p.monthly_fee_cents)}</div>
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </Section>
      </div>

      <Section title="数据导出 & 运维" description="一键下载 CSV / JSON，便于报税、对账、备份">
        <Card>
          <div className="flex flex-wrap gap-2 text-sm">
            <a href="/api/export/leads.csv" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 hover:bg-forge-line/60">⬇ leads.csv</a>
            <a href="/api/export/projects.csv" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 hover:bg-forge-line/60">⬇ projects.csv</a>
            <a href="/api/export/revenue.csv" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 hover:bg-forge-line/60">⬇ revenue.csv</a>
            <Link href="/audit" className="rounded-md bg-forge-line/60 px-3 py-1.5 hover:bg-forge-line">📜 审计日志</Link>
            <a href="/api/health" target="_blank" className="rounded-md bg-forge-line/60 px-3 py-1.5 hover:bg-forge-line">💓 健康检查</a>
          </div>
        </Card>
      </Section>

      <Section title="待办工单" description="活跃工单一览">
        {tickets.filter((t) => t.status === "open" || t.status === "in_progress").length === 0 ? (
          <EmptyState title="没有未关闭工单" description="客户反馈和月度维护任务会出现在这里" />
        ) : (
          <Card className="divide-y divide-forge-line/60 p-0">
            {tickets
              .filter((t) => t.status === "open" || t.status === "in_progress")
              .slice(0, 5)
              .map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <CardTitle className="text-sm">{t.title}</CardTitle>
                    <div className="text-xs text-forge-muted">优先级 {t.priority} · {fmtDate(t.opened_at)}</div>
                  </div>
                  <Pill tone={t.status === "open" ? "warning" : "accent"}>{t.status}</Pill>
                </div>
              ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

function stageTone(stage: LeadStage): "neutral" | "accent" | "success" | "warning" | "danger" {
  switch (stage) {
    case "lead":
    case "contacted":
      return "neutral";
    case "diagnosing":
    case "quoted":
      return "warning";
    case "piloting":
      return "accent";
    case "retainer":
      return "success";
    case "lost":
      return "danger";
  }
}
