import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Pill, Section } from "@/components/ui";
import { BundleButton } from "@/components/deliverables/bundle-button";
import { clientsRepo, deliverablesRepo, projectsRepo } from "@/lib/repo";
import { getTemplate } from "@/lib/templates";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function updateParams(deliverableId: number, projectId: number, formData: FormData) {
  "use server";
  const d = deliverablesRepo.get(deliverableId);
  if (!d) return;
  const t = getTemplate(d.template_slug);
  if (!t) return;
  const params: Record<string, string> = {};
  for (const p of t.params) {
    const v = formData.get(`p_${p.key}`);
    params[p.key] = typeof v === "string" ? v : p.default ?? "";
  }
  // Re-insert by way of recreate is overkill; do a direct update.
  const sqlite = await import("@/lib/db").then((m) => m.getDb());
  sqlite.prepare("UPDATE deliverables SET params_json = ? WHERE id = ?").run(JSON.stringify(params), deliverableId);
  redirect(`/projects/${projectId}/deliverables/${deliverableId}`);
}

export default function DeliverableDetailPage({ params }: { params: { id: string; did: string } }) {
  const projectId = Number(params.id);
  const deliverableId = Number(params.did);
  const d = deliverablesRepo.get(deliverableId);
  if (!d) notFound();
  const project = projectsRepo.get(projectId);
  if (!project) notFound();
  const t = getTemplate(d.template_slug);
  if (!t) notFound();
  const client = project.client_id ? clientsRepo.get(project.client_id) : null;
  const current = deliverablesRepo.parseParams(d);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`${t.name}`}
        description={`项目：${project.name} · 客户：${client?.company ?? "—"}`}
        action={
          <Link href={`/projects/${projectId}`} className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            ← 项目
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">模板</div>
          <div className="mt-2 text-base font-semibold text-ink-50">{t.name}</div>
          <div className="text-xs text-forge-muted">slug: {t.slug}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">状态</div>
          <div className="mt-2">{d.bundle_path ? <Pill tone="success">已打包</Pill> : <Pill tone="warning">待打包</Pill>}</div>
          <div className="text-xs text-forge-muted">{d.delivered_at ? `打包于 ${fmtDate(d.delivered_at)}` : "—"}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">大小</div>
          <div className="mt-2 text-base font-semibold text-ink-50">{d.bundle_size_bytes ? `${Math.round(d.bundle_size_bytes / 1024)} KB` : "—"}</div>
        </Card>
      </div>

      <Section title="参数" description={`改完保存后，重新点 "打包" 生成新版本`}>
        <Card>
          <form action={updateParams.bind(null, deliverableId, projectId)} className="grid gap-3 md:grid-cols-2">
            {t.params.map((p) => (
              <Field key={p.key} label={p.label} hint={p.hint}>
                <Input name={`p_${p.key}`} defaultValue={String(current[p.key] ?? p.default ?? "")} />
              </Field>
            ))}
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
                保存参数
              </button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="打包 / 下载">
        <Card className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-ink-100">打包当前参数为客户可下载的 zip。</div>
            <div className="mt-1 text-xs text-forge-muted">{`包含 ${t.slug}.py + workflow.json + README.md + requirements.txt + DELIVERY.md`}</div>
          </div>
          <BundleButton deliverableId={deliverableId} projectId={projectId} hasBundle={!!d.bundle_path} />
        </Card>
      </Section>
    </div>
  );
}
