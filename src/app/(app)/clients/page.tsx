import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requirePermission } from "@/lib/current-user";
import { clientsRepo, projectsRepo, revenueRepo } from "@/lib/repo";
import { fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientsPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePermission("read", "clients");
  const q = (searchParams.q ?? "").trim();
  const clients = clientsRepo.list(q ? { q } : undefined);
  const projects = projectsRepo.list();
  const revenue = revenueRepo.list();
  const projectsOf = (cid: number) => projects.filter((p) => p.client_id === cid);
  const lifetimeRevenue = (cid: number) => revenue.filter((r) => r.client_id === cid).reduce((a, r) => a + r.amount_cents, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="客户 Clients"
        description="已成交客户名册 + 项目历史 + 累计收入。"
        action={
          <Link href="/clients/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
            + 新建客户
          </Link>
        }
      />

      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="搜索公司 / 联系人 / 行业 / 备注..."
          className="flex-1 rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
        />
        <button type="submit" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
          搜索
        </button>
        {q ? <Link href="/clients" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">清除</Link> : null}
      </form>

      {clients.length === 0 ? (
        <EmptyState title="还没有客户" description={q ? "没有匹配的客户。" : "线索成交后可在此沉淀客户信息。"} />
      ) : (
        <Card className="divide-y divide-forge-line/60 p-0">
          {clients.map((c) => {
            const ps = projectsOf(c.id);
            const lr = lifetimeRevenue(c.id);
            return (
              <Link key={c.id} href={`/clients/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-forge-line/30">
                <div>
                  <div className="text-base font-medium text-ink-50">{c.company}</div>
                  <div className="text-xs text-forge-muted">{c.name} · {c.industry} · {c.size}</div>
                  <div className="text-xs text-forge-muted">{c.contact || "—"}</div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Pill tone={ps.length > 0 ? "accent" : "neutral"}>{ps.length} 项目</Pill>
                  <span className="text-ink-100">累计 {fmtCents(lr)}</span>
                  <span className="text-forge-muted">{fmtDate(c.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
