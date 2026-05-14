import { notFound } from "next/navigation";
import { sowRepo, solutionPackagesRepo, acceptanceRecordsRepo } from "@/lib/delivery-os";
import { projectsRepo, clientsRepo } from "@/lib/repo";
import type { PaymentMilestone } from "@/lib/delivery-os";
import { fmtCents, fmtDate } from "@/lib/utils";
import PortalApproveButton from "./portal-approve-button";

export const dynamic = "force-dynamic";

const APPROVAL_LABELS: Record<string, string> = {
  pending: "待您确认",
  approved: "已确认",
  revision_requested: "请求修订",
};

const SIGNOFF_LABELS: Record<string, string> = {
  pending: "待签署",
  signed: "已签署",
  rejected: "已拒绝",
};

async function approveSOW(sowId: number) {
  "use server";
  sowRepo.approve(sowId);
}

export default async function ClientPortalPage({ params }: { params: { token: string } }) {
  const sow = sowRepo.getByPortalToken(params.token);
  if (!sow) notFound();

  const project = sow.project_id ? projectsRepo.get(sow.project_id) : null;
  const client = project?.client_id ? clientsRepo.get(project.client_id) : null;
  const pkg = sow.solution_package_id ? solutionPackagesRepo.get(sow.solution_package_id) : null;
  const acceptances = sow.project_id ? acceptanceRecordsRepo.list(sow.project_id) : [];

  const scopeIn: string[] = sowRepo.parseField(sow.scope_included, []);
  const scopeOut: string[] = sowRepo.parseField(sow.scope_excluded, []);
  const deliverables: string[] = sowRepo.parseField(sow.deliverables, []);
  const milestones: PaymentMilestone[] = sowRepo.parseField(sow.payment_milestones, []);
  const assumptions: string[] = sowRepo.parseField(sow.assumptions, []);

  const steps: string[] = pkg ? solutionPackagesRepo.parseField(pkg.recommended_automation_steps, []) : [];
  const artifacts: string[] = pkg ? solutionPackagesRepo.parseField(pkg.delivery_artifacts, []) : [];
  const criteria: string[] = pkg ? solutionPackagesRepo.parseField(pkg.acceptance_criteria, []) : [];

  const latestAcceptance = acceptances[0] ?? null;
  const acceptedFeatures: string[] = latestAcceptance
    ? acceptanceRecordsRepo.parseField(latestAcceptance.accepted_features, [])
    : [];
  const knownLimitations: string[] = latestAcceptance
    ? acceptanceRecordsRepo.parseField(latestAcceptance.known_limitations, [])
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="text-lg font-semibold">AgentFlow · 客户服务门户</div>
            <div className="text-xs text-slate-400">本页面为专属项目确认页，请勿转发</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{client?.company ?? "客户"}</div>
            <div className="text-slate-400">{project?.name ?? "项目"}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {/* Status Banner */}
        <div className={`rounded-lg border px-5 py-4 ${
          sow.customer_approval_status === "approved"
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-base">
                {APPROVAL_LABELS[sow.customer_approval_status] ?? sow.customer_approval_status}
              </div>
              <div className="mt-0.5 text-sm text-slate-400">
                {sow.customer_approval_status === "approved"
                  ? "感谢您的确认，项目正在推进中"
                  : "请确认以下内容，如有问题请联系您的顾问"}
              </div>
            </div>
            {latestAcceptance && (
              <div className={`rounded-full px-3 py-1 text-xs font-medium ${
                latestAcceptance.signoff_status === "signed"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}>
                验收：{SIGNOFF_LABELS[latestAcceptance.signoff_status] ?? latestAcceptance.signoff_status}
              </div>
            )}
          </div>
        </div>

        {/* Customer Confirmation CTA */}
        {sow.customer_approval_status === "pending" && (
          <PortalApproveButton approve={approveSOW.bind(null, sow.id)} />
        )}

        {/* Project Overview */}
        {project && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-200">项目概况</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "项目名称", value: project.name },
                { label: "合同金额", value: fmtCents(sow.price_cents) },
                { label: "交付周期", value: `${sow.timeline_weeks} 周` },
                { label: "开始日期", value: fmtDate(project.started_at) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs text-slate-400">{label}</div>
                  <div className="mt-1 font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Solution Package Summary */}
        {pkg && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-200">解决方案</h2>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div>
                <div className="font-medium text-slate-200">{pkg.name}</div>
                <div className="mt-1 text-sm text-slate-400">{pkg.target_scenario}</div>
              </div>
              {pkg.problem_statement && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-400">业务问题诊断</div>
                  <pre className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed font-sans">
                    {pkg.problem_statement}
                  </pre>
                </div>
              )}
              {steps.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-400">自动化方案步骤</div>
                  <ol className="space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="mt-0.5 shrink-0 font-mono text-xs text-blue-400">{String(i + 1).padStart(2, "0")}</span>
                        {s}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </section>
        )}

        {/* SOW Details */}
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-200">服务范围与报价</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {scopeIn.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="mb-2 text-xs font-medium text-slate-400">包含范围</div>
                <ul className="space-y-1.5">
                  {scopeIn.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5 text-emerald-400">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scopeOut.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="mb-2 text-xs font-medium text-slate-400">不含范围</div>
                <ul className="space-y-1.5">
                  {scopeOut.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="mt-0.5 text-rose-400">✕</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {deliverables.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 text-xs font-medium text-slate-400">交付成果</div>
              <div className="flex flex-wrap gap-2">
                {deliverables.map((d, i) => (
                  <span key={i} className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-300">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}

          {assumptions.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 text-xs font-medium text-slate-400">假设条件与客户责任</div>
              <ul className="space-y-1.5">
                {assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="mt-0.5">·</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Payment Milestones */}
        {milestones.length > 0 && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-200">付款节点</h2>
            <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
              {milestones.map((m, i) => (
                <div key={i} className={`flex items-center justify-between px-5 py-4 ${i > 0 ? "border-t border-slate-800" : ""}`}>
                  <div>
                    <div className="font-medium text-slate-200">{m.label}</div>
                    <div className="text-xs text-slate-400">预计日期：{m.due}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-100">{fmtCents(m.amount_cents)}</div>
                    <div className="text-xs text-slate-400">{m.pct}%</div>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-700 bg-slate-800/50 flex items-center justify-between px-5 py-3">
                <div className="text-sm font-medium text-slate-300">合计</div>
                <div className="font-bold text-lg">{fmtCents(sow.price_cents)}</div>
              </div>
            </div>
          </section>
        )}

        {/* Acceptance Status */}
        {latestAcceptance && (
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-200">验收状态</h2>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  latestAcceptance.signoff_status === "signed"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/20 text-amber-300"
                }`}>
                  {SIGNOFF_LABELS[latestAcceptance.signoff_status] ?? latestAcceptance.signoff_status}
                </span>
                {latestAcceptance.customer_confirmed_at && (
                  <span className="text-sm text-slate-400">确认于 {fmtDate(latestAcceptance.customer_confirmed_at)}</span>
                )}
              </div>

              {acceptedFeatures.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-400">已验收功能</div>
                  <ul className="space-y-1">
                    {acceptedFeatures.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-emerald-400">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {knownLimitations.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-400">已知限制</div>
                  <ul className="space-y-1">
                    {knownLimitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <span className="text-amber-400">!</span> {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {criteria.length > 0 && (
                <div>
                  <div className="mb-1.5 text-xs font-medium text-slate-400">验收标准</div>
                  <ul className="space-y-1">
                    {criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                        <span className="text-blue-400">·</span> {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-slate-800 pt-6 text-center text-xs text-slate-500">
          本页面由 AgentFlow 生成 · 如有问题，请联系您的项目顾问 · {fmtDate(sow.created_at)}
        </footer>
      </main>
    </div>
  );
}
