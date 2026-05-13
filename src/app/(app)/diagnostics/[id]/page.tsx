import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, PageHeader, Pill, Section } from "@/components/ui";
import { GenerateReportForm } from "@/components/diagnostics/generate-form";
import { clientsRepo, diagnosticsRepo, projectsRepo } from "@/lib/repo";
import { TEMPLATE_BY_SLUG } from "@/lib/templates";
import { fmtCents, fmtDate, renderMarkdown } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function convertToProject(id: number) {
  "use server";
  const d = diagnosticsRepo.get(id);
  if (!d) return;
  if (!d.client_id) {
    // Need a client first — create a stub one.
    const stub = clientsRepo.create({
      name: "（待补充）",
      company: d.title.split(" · ")[0] || "新客户",
      industry: "—",
      size: "未填写",
      contact: "—",
      billing_email: "",
      notes: `Auto-created from diagnostic #${id}`,
    });
    diagnosticsRepo.update(id, { status: "converted" });
    const project = projectsRepo.create({
      client_id: stub.id,
      diagnostic_id: id,
      name: `${d.title.replace(" · AI 工作流诊断", "")} · 试点`,
      status: "pilot",
      project_fee_cents: d.pricing_quote_cents,
      monthly_fee_cents: d.monthly_quote_cents,
      notes: "",
    });
    redirect(`/projects/${project.id}`);
  }
  diagnosticsRepo.update(id, { status: "converted" });
  const project = projectsRepo.create({
    client_id: d.client_id,
    diagnostic_id: id,
    name: `${d.title.replace(" · AI 工作流诊断", "")} · 试点`,
    status: "pilot",
    project_fee_cents: d.pricing_quote_cents,
    monthly_fee_cents: d.monthly_quote_cents,
    notes: "",
  });
  redirect(`/projects/${project.id}`);
}

export default function DiagnosticDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const d = diagnosticsRepo.get(id);
  if (!d) notFound();
  const recommended = diagnosticsRepo.recommendedTemplates(d);
  const q = diagnosticsRepo.parseQuestionnaire(d) as Record<string, unknown> & {
    company?: { name?: string; industry?: string; size?: string };
    workflows?: { name: string; currentMinutesPerOccurrence: number; occurrencesPerMonth: number; headcountInvolved: number }[];
    existingSystems?: string[];
    goals?: string[];
  };
  const convert = convertToProject.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={d.title}
        description={`${d.client_id ? "已关联客户" : "未关联客户"} · 创建于 ${fmtDate(d.created_at)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {d.share_token ? (
              <>
                <Link href={`/share/${d.share_token}`} target="_blank" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
                  分享链接
                </Link>
                <Link href={`/share/${d.share_token}/print`} target="_blank" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
                  打印版
                </Link>
              </>
            ) : null}
            <a href={`/api/export/diagnostics/${id}`} className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
              ⬇ JSON
            </a>
            {d.status === "ready" || d.status === "shared" ? (
              <form action={convert}>
                <button className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
                  转项目
                </button>
              </form>
            ) : null}
            <Link href="/diagnostics" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
              ← 列表
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">状态</div>
          <div className="mt-2"><Pill tone={d.status === "ready" || d.status === "shared" ? "success" : d.status === "converted" ? "accent" : "neutral"}>{d.status}</Pill></div>
          <div className="mt-2 text-xs text-forge-muted">{d.model_used ?? "尚未生成"}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">推荐项目费</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{fmtCents(d.pricing_quote_cents)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">推荐月费</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{fmtCents(d.monthly_quote_cents)}</div>
        </Card>
      </div>

      <Section title="问卷快照" description="点击 Generate 调用 Claude 生成诊断报告">
        <Card>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <span className="text-forge-muted">公司：</span>
              <span className="text-ink-100">{q.company?.name} · {q.company?.industry} · {q.company?.size}</span>
            </div>
            <div>
              <span className="text-forge-muted">现有系统：</span>
              <span className="text-ink-100">{(q.existingSystems || []).join(" / ") || "—"}</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-forge-muted">目标：</span>
              <ul className="ml-4 list-disc text-ink-100">
                {(q.goals || []).map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-forge-muted">工作流：</div>
              <div className="space-y-2">
                {(q.workflows || []).map((w, i) => (
                  <div key={i} className="rounded-md border border-forge-line/60 p-2 text-xs">
                    <div className="text-sm font-medium text-ink-100">{w.name}</div>
                    <div className="text-forge-muted">{w.currentMinutesPerOccurrence}分/次 · 月 {w.occurrencesPerMonth} 次 · {w.headcountInvolved} 人</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-forge-line/60 pt-3">
            <GenerateReportForm diagnosticId={id} hasReport={!!d.report_markdown} />
          </div>
        </Card>
      </Section>

      {recommended.length > 0 ? (
        <Section title="推荐模板" description="Claude 基于问卷推荐">
          <div className="grid gap-3 md:grid-cols-3">
            {recommended.map((slug) => {
              const t = TEMPLATE_BY_SLUG[slug];
              if (!t) return <Card key={slug}>未知模板：{slug}</Card>;
              return (
                <Link key={slug} href={`/templates/${slug}`}>
                  <Card className="cursor-pointer transition hover:border-accent-500">
                    <div className="text-sm font-medium text-ink-50">{t.name}</div>
                    <div className="mt-1 text-xs text-forge-muted">{t.short}</div>
                    <div className="mt-3 text-xs text-accent-300">¥{(t.priceCents[0] / 100).toLocaleString()} - ¥{(t.priceCents[1] / 100).toLocaleString()} · {t.estDays} 天</div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </Section>
      ) : null}

      {d.report_markdown ? (
        <Section title="诊断报告">
          <Card className="prose-forge" >
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(d.report_markdown) }} />
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
