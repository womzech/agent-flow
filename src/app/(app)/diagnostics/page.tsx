import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requirePermission } from "@/lib/current-user";
import { diagnosticsRepo } from "@/lib/repo";
import { fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DiagnosticsListPage() {
  await requirePermission("read", "diagnostics");
  const list = diagnosticsRepo.list();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="诊断报告"
        description="销售 hook 产品：单价 5000-10000 元，3-5 天交付。"
        action={
          <Link href="/diagnostics/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
            + 新建诊断
          </Link>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="还没有诊断"
          description="新建一个诊断作为销售切入点"
          action={
            <Link href="/diagnostics/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
              开始第一份诊断
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-forge-line/60 p-0">
          {list.map((d) => (
            <Link key={d.id} href={`/diagnostics/${d.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-forge-line/30">
              <div>
                <div className="text-base font-medium text-ink-50">{d.title}</div>
                <div className="mt-1 text-xs text-forge-muted">{fmtDate(d.updated_at)} · {d.model_used || "未生成"}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-forge-muted">
                  <div>报价 {fmtCents(d.pricing_quote_cents)}</div>
                  <div>月费 {fmtCents(d.monthly_quote_cents)}</div>
                </div>
                <Pill tone={d.status === "ready" || d.status === "shared" ? "success" : d.status === "converted" ? "accent" : "neutral"}>
                  {d.status}
                </Pill>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
