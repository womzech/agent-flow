import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { leadsRepo } from "@/lib/repo";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type LeadSource,
  type LeadStage,
} from "@/lib/schema";

export const dynamic = "force-dynamic";

export default function LeadsKanbanPage({ searchParams }: { searchParams: { q?: string; stage?: string; source?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const stageFilter = (LEAD_STAGES as readonly string[]).includes(searchParams.stage ?? "")
    ? (searchParams.stage as LeadStage)
    : undefined;
  const sourceFilter = (LEAD_SOURCES as readonly string[]).includes(searchParams.source ?? "")
    ? (searchParams.source as LeadSource)
    : undefined;

  const leads = leadsRepo.list({ q: q || undefined, stage: stageFilter, source: sourceFilter });
  const grouped = LEAD_STAGES.reduce<Record<LeadStage, typeof leads>>(
    (acc, stage) => ({ ...acc, [stage]: leads.filter((l) => l.stage === stage) }),
    {} as Record<LeadStage, typeof leads>,
  );

  const baseHref = (extra: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = {
      q: q || undefined,
      stage: stageFilter,
      source: sourceFilter,
      ...extra,
    };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) usp.set(k, String(v));
    const s = usp.toString();
    return s ? `/leads?${s}` : "/leads";
  };

  const filterActive = !!(q || stageFilter || sourceFilter);

  return (
    <div>
      <PageHeader
        title="线索 Pipeline"
        description="销售看板：从「新线索」→「月度维护」的 7 个阶段。"
        action={
          <Link href="/leads/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
            + 新建线索
          </Link>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索公司 / 联系人 / 痛点..."
          className="min-w-[260px] flex-1 rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
        />
        <select
          name="stage"
          defaultValue={stageFilter ?? ""}
          className="rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
        >
          <option value="">全部阶段</option>
          {LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>)}
        </select>
        <select
          name="source"
          defaultValue={sourceFilter ?? ""}
          className="rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
        >
          <option value="">全部渠道</option>
          {LEAD_SOURCES.map((s) => <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>)}
        </select>
        <button type="submit" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">筛选</button>
        {filterActive ? <Link href="/leads" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">清除</Link> : null}
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title={filterActive ? "没有匹配线索" : "还没有线索"}
          description={filterActive ? "调整搜索条件试试" : "录入第一条线索开始销售流程"}
          action={
            <Link href="/leads/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
              新建线索
            </Link>
          }
        />
      ) : (
        <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
          {LEAD_STAGES.map((stage) => (
            <div key={stage} className="flex flex-col gap-3">
              <Link href={baseHref({ stage: stage === stageFilter ? undefined : stage })} className="flex items-center justify-between rounded-md bg-forge-panel/60 px-3 py-2 text-sm hover:bg-forge-line/40">
                <span className={"font-medium " + (stage === stageFilter ? "text-accent-300" : "text-ink-100")}>{LEAD_STAGE_LABELS[stage]}</span>
                <span className="text-xs text-forge-muted">{grouped[stage].length}</span>
              </Link>
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
