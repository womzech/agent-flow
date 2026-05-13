import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { leadsRepo } from "@/lib/repo";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type LeadStage,
} from "@/lib/schema";

export const dynamic = "force-dynamic";

export default function LeadsKanbanPage() {
  const leads = leadsRepo.list();
  const grouped = LEAD_STAGES.reduce<Record<LeadStage, typeof leads>>(
    (acc, stage) => ({ ...acc, [stage]: leads.filter((l) => l.stage === stage) }),
    {} as Record<LeadStage, typeof leads>,
  );

  return (
    <div>
      <PageHeader
        title="线索 Pipeline"
        description="销售看板：从「新线索」→「月度维护」的 7 个阶段。"
        action={
          <Link
            href="/leads/new"
            className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400"
          >
            + 新建线索
          </Link>
        }
      />

      {leads.length === 0 ? (
        <EmptyState
          title="还没有线索"
          description="录入第一条线索开始销售流程"
          action={
            <Link
              href="/leads/new"
              className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400"
            >
              新建线索
            </Link>
          }
        />
      ) : (
        <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
          {LEAD_STAGES.map((stage) => (
            <div key={stage} className="flex flex-col gap-3">
              <div className="flex items-center justify-between rounded-md bg-forge-panel/60 px-3 py-2 text-sm">
                <span className="font-medium text-ink-100">{LEAD_STAGE_LABELS[stage]}</span>
                <span className="text-xs text-forge-muted">{grouped[stage].length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {grouped[stage].map((lead) => (
                  <Link key={lead.id} href={`/leads/${lead.id}`}>
                    <Card className="cursor-pointer p-4 transition hover:border-accent-500">
                      <div className="text-sm font-semibold text-ink-50">{lead.company}</div>
                      <div className="mt-0.5 text-xs text-forge-muted">{lead.name} · {lead.industry}</div>
                      <div className="mt-2 line-clamp-3 text-xs text-ink-200">{lead.pain_points || "（暂无痛点描述）"}</div>
                      <div className="mt-3 flex items-center justify-between">
                        <Pill tone="neutral">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</Pill>
                        {lead.next_action ? <span className="text-[10px] text-accent-300">有下一步</span> : null}
                      </div>
                    </Card>
                  </Link>
                ))}
                {grouped[stage].length === 0 ? (
                  <div className="rounded-md border border-dashed border-forge-line/60 px-3 py-6 text-center text-xs text-forge-muted">
                    暂无
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
