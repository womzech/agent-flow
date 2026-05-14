import { notFound } from "next/navigation";
import Link from "next/link";
import { projectsRepo } from "@/lib/repo";
import { acceptanceRecordsRepo, solutionPackagesRepo } from "@/lib/delivery-os";
import { Card, CardHeader, CardTitle, CardDescription, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import CreateAcceptanceForm from "./create-acceptance-form";

export const dynamic = "force-dynamic";

const STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  pending: "warning",
  signed: "success",
  rejected: "danger",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待签署",
  signed: "已签署",
  rejected: "已拒绝",
};

export default async function AcceptancePage({ params }: { params: { id: string } }) {
  const projectId = Number(params.id);
  if (!Number.isFinite(projectId)) notFound();

  const project = projectsRepo.get(projectId);
  if (!project) notFound();

  const records = acceptanceRecordsRepo.list(projectId);
  const packages = solutionPackagesRepo.list(projectId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-forge-muted">
        {["数据导入", "诊断", "方案", "报价/SOW", "客户确认", "验收"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span className={i === 5 ? "font-semibold text-accent-300" : ""}>{s}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-50">验收记录</h1>
          <p className="mt-1 text-sm text-forge-muted">项目：{project.name}</p>
        </div>
        <Link href={`/projects/${projectId}`} className="text-sm text-accent-400 hover:text-accent-300 underline">
          ← 项目工作区
        </Link>
      </div>

      {/* Existing records */}
      {records.length > 0 ? (
        <div className="space-y-4">
          {records.map((ar) => {
            const features: string[] = JSON.parse(ar.accepted_features || "[]");
            const limitations: string[] = JSON.parse(ar.known_limitations || "[]");
            const excluded: string[] = JSON.parse(ar.excluded_items || "[]");

            return (
              <Card key={ar.id}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>验收单 #{ar.id}</CardTitle>
                    <Pill tone={STATUS_TONES[ar.signoff_status] ?? "neutral"}>
                      {STATUS_LABELS[ar.signoff_status] ?? ar.signoff_status}
                    </Pill>
                  </div>
                  <CardDescription>
                    创建于 {fmtDate(ar.created_at)}
                    {ar.customer_confirmed_at ? ` · 客户确认于 ${fmtDate(ar.customer_confirmed_at)}` : ""}
                  </CardDescription>
                </CardHeader>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {features.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-forge-muted">已验收功能</div>
                      <ul className="space-y-1">
                        {features.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-sm text-ink-200">
                            <span className="text-emerald-400 shrink-0">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {limitations.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-forge-muted">已知限制</div>
                      <ul className="space-y-1">
                        {limitations.map((l, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-sm text-ink-200">
                            <span className="text-amber-400 shrink-0">!</span> {l}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {excluded.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-forge-muted">不含事项</div>
                      <ul className="space-y-1">
                        {excluded.map((e, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-sm text-ink-200">
                            <span className="text-forge-muted shrink-0">·</span> {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="py-10 text-center">
          <div className="text-base font-medium text-ink-100">暂无验收记录</div>
          <div className="mt-1 text-sm text-forge-muted">填写下方表单创建第一条验收记录</div>
        </Card>
      )}

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>新增验收记录</CardTitle>
        </CardHeader>
        <CreateAcceptanceForm projectId={projectId} packages={packages.map((p) => ({ id: p.id, name: p.name }))} />
      </Card>
    </div>
  );
}
