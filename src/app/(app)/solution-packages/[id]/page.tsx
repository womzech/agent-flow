import { notFound } from "next/navigation";
import Link from "next/link";
import { solutionPackagesRepo } from "@/lib/delivery-os";
import { Card, CardHeader, CardTitle, CardDescription, Pill, Button } from "@/components/ui";
import { fmtCents, fmtDate } from "@/lib/utils";
import GenerateSOWButton from "./generate-sow-button";

export const dynamic = "force-dynamic";

export default async function SolutionPackagePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const pkg = solutionPackagesRepo.get(id);
  if (!pkg) notFound();

  const steps: string[] = solutionPackagesRepo.parseField(pkg.recommended_automation_steps, []);
  const artifacts: string[] = solutionPackagesRepo.parseField(pkg.delivery_artifacts, []);
  const inputs: string[] = solutionPackagesRepo.parseField(pkg.required_inputs, []);
  const criteria: string[] = solutionPackagesRepo.parseField(pkg.acceptance_criteria, []);
  const maintenance: { monthly_items?: string[]; monthly_cents?: number } =
    solutionPackagesRepo.parseField(pkg.maintenance_plan, {});
  const pricing: {
    min_cents?: number;
    max_cents?: number;
    recommended_cents?: number;
    recommended_monthly_cents?: number;
    est_days?: number;
    note?: string;
  } = solutionPackagesRepo.parseField(pkg.pricing_model, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-forge-muted">
        {["数据导入", "诊断", "方案", "报价/SOW", "客户确认", "验收"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span className={i === 2 ? "font-semibold text-accent-300" : ""}>{s}</span>
          </span>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-ink-50">{pkg.name}</h1>
            <Pill tone="accent">v{pkg.version}</Pill>
          </div>
          <p className="mt-1 text-sm text-forge-muted">{pkg.target_scenario}</p>
          <p className="mt-0.5 text-xs text-forge-muted">创建于 {fmtDate(pkg.created_at)}</p>
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <GenerateSOWButton packageId={id} />
          {pkg.data_import_id && (
            <Link href={`/data-imports/${pkg.data_import_id}`}>
              <Button size="sm" variant="secondary">← 查看数据导入</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Problem Statement */}
      <Card>
        <CardHeader>
          <CardTitle>问题陈述</CardTitle>
        </CardHeader>
        <pre className="whitespace-pre-wrap text-sm text-ink-200 leading-relaxed font-sans">
          {pkg.problem_statement || "暂无描述"}
        </pre>
      </Card>

      {/* Pricing */}
      {pricing.recommended_cents && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <div className="text-xs text-forge-muted">参考报价</div>
            <div className="mt-1 text-xl font-semibold text-ink-50">{fmtCents(pricing.recommended_cents)}</div>
          </Card>
          {pricing.min_cents && pricing.max_cents && (
            <Card>
              <div className="text-xs text-forge-muted">报价区间</div>
              <div className="mt-1 text-base font-medium text-ink-100">
                {fmtCents(pricing.min_cents)} – {fmtCents(pricing.max_cents)}
              </div>
            </Card>
          )}
          {pricing.recommended_monthly_cents && (
            <Card>
              <div className="text-xs text-forge-muted">月度维护费</div>
              <div className="mt-1 text-xl font-semibold text-ink-50">{fmtCents(pricing.recommended_monthly_cents)}/月</div>
            </Card>
          )}
          {pricing.est_days && (
            <Card>
              <div className="text-xs text-forge-muted">预计交付</div>
              <div className="mt-1 text-xl font-semibold text-ink-50">{pricing.est_days} 天</div>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Automation Steps */}
        <Card>
          <CardHeader>
            <CardTitle>推荐自动化步骤</CardTitle>
            <Pill>{steps.length} 步</Pill>
          </CardHeader>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 shrink-0 font-mono text-accent-400 text-xs">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        {/* Required Inputs */}
        <Card>
          <CardHeader>
            <CardTitle>所需输入资源</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {inputs.map((inp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-forge-muted">·</span>
                {inp}
              </li>
            ))}
          </ul>
        </Card>

        {/* Delivery Artifacts */}
        <Card>
          <CardHeader>
            <CardTitle>交付成果</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {artifacts.map((art, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-emerald-400">✓</span>
                {art}
              </li>
            ))}
          </ul>
        </Card>

        {/* Acceptance Criteria */}
        <Card>
          <CardHeader>
            <CardTitle>验收标准</CardTitle>
          </CardHeader>
          <ul className="space-y-1.5">
            {criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-accent-400">✓</span>
                {c}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Maintenance Plan */}
      {(maintenance.monthly_items ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>运维计划</CardTitle>
            {maintenance.monthly_cents && (
              <CardDescription>{fmtCents(maintenance.monthly_cents)}/月</CardDescription>
            )}
          </CardHeader>
          <ul className="space-y-1.5">
            {(maintenance.monthly_items ?? []).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-200">
                <span className="mt-0.5 text-forge-muted">·</span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Template */}
      {pkg.template_slug && (
        <Card>
          <CardHeader>
            <CardTitle>基础模板</CardTitle>
          </CardHeader>
          <Link href={`/templates/${pkg.template_slug}`} className="text-sm text-accent-400 hover:text-accent-300 underline">
            {pkg.template_slug}
          </Link>
        </Card>
      )}
    </div>
  );
}
