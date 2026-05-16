import { notFound } from "next/navigation";
import Link from "next/link";
import { sowRepo, solutionPackagesRepo } from "@/lib/delivery-os";
import type { PaymentMilestone, PricingModel } from "@/lib/delivery-os";
import { isTokenExpired } from "@/lib/repo";
import { Card, CardHeader, CardTitle, CardDescription, Pill } from "@/components/ui";
import { fmtCents, fmtDate } from "@/lib/utils";
import { record as auditRecord } from "@/lib/audit";
import { currentUser } from "@/lib/current-user";
import ApproveSOWButton from "./approve-sow-button";

export const dynamic = "force-dynamic";

async function revokePortal(id: number) {
  "use server";
  const me = await currentUser();
  sowRepo.revokePortalToken(id);
  auditRecord({
    actor: me?.user.email ?? "unknown",
    action: "portal.revoke",
    entity: "sow",
    entityId: id,
  });
}

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
  const pricingModel: PricingModel = pkg ? solutionPackagesRepo.parseField(pkg.pricing_model, {}) : {};
  const outcome = pricingModel.outcome;

  const portalActive = !!sow.portal_token && !sow.token_revoked_at && !isTokenExpired(sow.token_expires_at);
  const portalUrl = portalActive ? `/portal/${sow.portal_token}` : null;
  const portalStatus = !sow.portal_token
    ? null
    : sow.token_revoked_at
      ? "已撤回"
      : isTokenExpired(sow.token_expires_at)
        ? "已过期"
        : "有效";
  const revokePortalBound = revokePortal.bind(null, id);

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
          {portalActive && (
            <form action={revokePortalBound}>
              <button className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20">
                撤回门户链接
              </button>
            </form>
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
            <div className="mt-1 text-sm text-forge-muted">{portalStatus ?? "暂无"}</div>
          )}
          {sow.portal_token && (
            <div className="mt-2 border-t border-forge-line/40 pt-2 text-xs text-forge-muted">
              <div>状态：<span className={portalStatus === "有效" ? "text-emerald-300" : "text-rose-300"}>{portalStatus}</span></div>
              {portalActive ? (
                <>
                  <div>访问次数：<span className="text-ink-100">{sow.token_view_count}</span></div>
                  <div>最近访问：{sow.token_last_viewed_at ? fmtDate(sow.token_last_viewed_at) : "—"}</div>
                  <div>到期：{sow.token_expires_at ? fmtDate(sow.token_expires_at) : "—"}</div>
                </>
              ) : (
                <div>{sow.token_revoked_at ? `撤回于 ${fmtDate(sow.token_revoked_at)}` : "已过期"}</div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Outcome-based pricing (optional, attached on the solution package) */}
      {outcome && (
        <Card>
          <CardHeader>
            <CardTitle>按结果定价</CardTitle>
            <CardDescription>除里程碑外的浮动条款</CardDescription>
          </CardHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md bg-forge p-3 text-sm">
              <div className="text-xs text-forge-muted">单次结果定义</div>
              <div className="mt-1 text-ink-100">{outcome.definition}</div>
            </div>
            <div className="rounded-md bg-forge p-3 text-sm">
              <div className="text-xs text-forge-muted">单价</div>
              <div className="mt-1 text-ink-100">{fmtCents(outcome.unit_price_cents)} / 次</div>
              {outcome.monthly_floor_cents !== undefined && (
                <div className="mt-1 text-xs text-forge-muted">月度保底：{fmtCents(outcome.monthly_floor_cents)}</div>
              )}
              {outcome.monthly_cap_cents !== undefined && (
                <div className="mt-1 text-xs text-forge-muted">月度封顶：{fmtCents(outcome.monthly_cap_cents)}</div>
              )}
            </div>
            {outcome.measurement_notes && (
              <div className="md:col-span-2 rounded-md bg-forge p-3 text-sm text-ink-200">
                <div className="text-xs text-forge-muted">计量与争议处理</div>
                <div className="mt-1 whitespace-pre-wrap">{outcome.measurement_notes}</div>
              </div>
            )}
          </div>
        </Card>
      )}

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
