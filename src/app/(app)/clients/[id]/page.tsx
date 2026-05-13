import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Pill, Section, Textarea } from "@/components/ui";
import { record } from "@/lib/audit";
import { clientsRepo, diagnosticsRepo, projectsRepo, revenueRepo } from "@/lib/repo";
import { PROJECT_STATUS_LABELS } from "@/lib/schema";
import { fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function update(id: number, formData: FormData) {
  "use server";
  clientsRepo.update(id, {
    name: String(formData.get("name") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    industry: String(formData.get("industry") ?? "").trim(),
    size: String(formData.get("size") ?? "").trim() || "未填写",
    contact: String(formData.get("contact") ?? "").trim(),
    billing_email: String(formData.get("billing_email") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  record({ action: "client.update", entity: "client", entityId: id });
  redirect(`/clients/${id}`);
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const c = clientsRepo.get(id);
  if (!c) notFound();
  const projects = projectsRepo.list().filter((p) => p.client_id === id);
  const diagnostics = diagnosticsRepo.list().filter((d) => d.client_id === id);
  const revenue = revenueRepo.list().filter((r) => r.client_id === id);
  const lifetimeRevenue = revenue.reduce((a, r) => a + r.amount_cents, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={c.company}
        description={`${c.name} · ${c.industry || "—"} · ${c.size}`}
        action={
          <Link href="/clients" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            ← 客户列表
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">项目数</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{projects.length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">诊断数</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{diagnostics.length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">累计收入</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{fmtCents(lifetimeRevenue)}</div>
        </Card>
      </div>

      <Section title="资料">
        <Card>
          <form action={update.bind(null, id)} className="grid gap-3 md:grid-cols-2">
            <Field label="联系人"><Input name="name" defaultValue={c.name} /></Field>
            <Field label="公司"><Input name="company" defaultValue={c.company} /></Field>
            <Field label="行业"><Input name="industry" defaultValue={c.industry} /></Field>
            <Field label="规模"><Input name="size" defaultValue={c.size} /></Field>
            <Field label="联系方式"><Input name="contact" defaultValue={c.contact} /></Field>
            <Field label="开票邮箱"><Input name="billing_email" defaultValue={c.billing_email} /></Field>
            <div className="md:col-span-2">
              <Field label="备注"><Textarea name="notes" defaultValue={c.notes} rows={3} /></Field>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
                保存
              </button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="项目">
        {projects.length === 0 ? (
          <Card className="text-sm text-forge-muted">还没有项目。</Card>
        ) : (
          <Card className="divide-y divide-forge-line/60 p-0">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-forge-line/30">
                <div>
                  <div className="text-sm font-medium text-ink-50">{p.name}</div>
                  <div className="text-xs text-forge-muted">{fmtDate(p.started_at)}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Pill tone={p.status === "pilot" ? "accent" : p.status === "retainer" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Pill>
                  <span className="text-ink-100">{fmtCents(p.project_fee_cents)}</span>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
