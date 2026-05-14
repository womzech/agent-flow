import { notFound } from "next/navigation";
import Link from "next/link";
import { sowRepo, solutionPackagesRepo } from "@/lib/delivery-os";
import type { PaymentMilestone } from "@/lib/delivery-os";
import { Card, CardHeader, CardTitle, CardDescription, Pill } from "@/components/ui";
import { fmtCents, fmtDate } from "@/lib/utils";
import ApproveSOWButton from "./approve-sow-button";

export const dynamic = "force-dynamic";

const APPROVAL_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  revision_requested: "danger",
};

const APPROVAL_LABELS: Record<string, string> = {
  pending: "待客户确认",
  approved: "已确认",
  revision_requested: "请求修订",
};

export default async function SOWPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const sow = sowRepo.get(id);
  if (!sow) notFound();

  const pkg = sow.solution_package_id ? solutionPackagesRepo.get(sow.solution_package_id) : null;

  const scopeIn: string[] = sowRepo.parseField(sow.scope_included, []);
  const scopeOut: string[] = sowRepo.parseField(sow.scope_excluded, []);
  const assumptions: string[] = sowRepo.parseField(sow.assumptions, []);
  const deliverables: string[] = sowRepo.parseField(sow.deliverables, []);
  const milestones: PaymentMilestone[] = sowRepo.parseField(sow.payment_milestones, []);

  const portalUrl = sow.portal_token ? `/portal/${sow.portal_token}` : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-forge-muted">
        {["数据导入", "诊断", "方案", "报价/SOW", "客户确认", "验收"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span className={i === 3 ? "font-semibold text-accent-300" : ""}>{s}</span>
          </span>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-50">服务报价单 / SOW</h1>
            <Pill tone={APPROVAL_TONES[sow.customer_approval_status] ?? "neutral"}>
              {APPROVAL_LABELS[sow.customer_approval_status] ?? sow.customer_approval_status}
            </Pill>
          </div>
          {pkg && <p className="mt-1 text-sm text-forge-muted">基于方案包：{pkg.name}</p>}
          <p className="mt-0.5 text-xs text-forge-muted">创建于 {fmtDate(sow.created_at)}</p>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          {sow.customer_approval_status === "pending" && (
            <ApproveSOWButton sowId={id} />
          )}
          {portalUrl && (
            <Link href={portalUrl} target="_blank">
              <span className="rounded-md border border-accent-500/30 bg-accent-500/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-500/20 transition cursor-pointer">
                客户门户链接 ↗
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Price + Timeline */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-forge-muted">总价</div>
          <div className="mt-1 text-2xl font-semibold text-ink-50">{fmtCents(sow.price_cents)}</div>
        </Card>
        <Card>
          <div className="text-xs text-forge-muted">交付周期</div>
          <div className="mt-1 text-2xl font-semibold text-ink-50">{sow.timeline_weeks} 周</div>
        </Card>
        <Card>
          <div className="text-xs text-forge-muted">客户门户</div>
          {portalUrl ? (
            <Link href={portalUrl} target="_blank" className="mt-1 block text-sm text-accent-400 underline hover:text-accent-300 truncate">
              查看 →
            </Link>
          ) : (
            <div className="mt-1 text-sm text-forge-muted">暂无</div>
          )}
        </Card>
      </div>

      {/* Payment Milestones */}
      {milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>付款节点</CardTitle>
            <CardDescription>总价 {fmtCents(sow.price_cents)}</CardDescription>
          </CardHeader>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-md bg-forge p-3 text-sm">
                <div>
                  <div className="font-medium text-ink-100">{m.label}</div>
                  <div className="text-xs text-forge-muted">预计：{m.due}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-ink-50">{fmtCents(m.amount_cents)}</div>
                  <div className="text-xs text-forge-muted">{m.pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Scope Included */}
        <Card>
          <CardHeader>
            <CardTitle>交付范围（含）</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {scopeIn.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-emerald-400">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>

        {/* Scope Excluded */}
        <Card>
          <CardHeader>
            <CardTitle>不在范围（不含）</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {scopeOut.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-rose-400">✕</span>
                {s}
              </li>
            ))}
          </ul>
        </Card>

        {/* Deliverables */}
        <Card>
          <CardHeader>
            <CardTitle>交付成果清单</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {deliverables.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-accent-400">→</span>
                {d}
              </li>
            ))}
          </ul>
        </Card>

        {/* Assumptions */}
        <Card>
          <CardHeader>
            <CardTitle>假设条件</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {assumptions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-forge-muted">·</span>
                {a}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Links */}
      {pkg && (
        <div className="flex gap-3 text-sm">
          <Link href={`/solution-packages/${pkg.id}`} className="text-accent-400 hover:text-accent-300 underline">
            ← 方案包详情
          </Link>
          {sow.project_id && (
            <Link href={`/projects/${sow.project_id}`} className="text-accent-400 hover:text-accent-300 underline">
              ← 项目工作区
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
