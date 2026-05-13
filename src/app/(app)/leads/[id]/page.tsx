import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Pill, Section, Select, Textarea } from "@/components/ui";
import { clientsRepo, diagnosticsRepo, leadsRepo } from "@/lib/repo";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  type LeadSource,
  type LeadStage,
} from "@/lib/schema";
import { fmtDate } from "@/lib/utils";

async function updateLead(id: number, formData: FormData) {
  "use server";
  leadsRepo.update(id, {
    name: String(formData.get("name") ?? "").trim(),
    company: String(formData.get("company") ?? "").trim(),
    industry: String(formData.get("industry") ?? "").trim(),
    contact: String(formData.get("contact") ?? "").trim(),
    source: (formData.get("source") as LeadSource) || "unknown",
    stage: (formData.get("stage") as LeadStage) || "lead",
    pain_points: String(formData.get("pain_points") ?? "").trim(),
    budget_note: String(formData.get("budget_note") ?? "").trim(),
    next_action: String(formData.get("next_action") ?? "").trim(),
  });
  redirect(`/leads/${id}`);
}

async function convertToClient(id: number) {
  "use server";
  const lead = leadsRepo.get(id);
  if (!lead) return;
  let clientId = lead.client_id;
  if (!clientId) {
    const client = clientsRepo.create({
      name: lead.name,
      company: lead.company,
      industry: lead.industry,
      size: "未填写",
      contact: lead.contact,
      billing_email: "",
      notes: `从 lead #${id} 转化。痛点：${lead.pain_points}`,
    });
    clientId = client.id;
  }
  leadsRepo.update(id, { client_id: clientId, stage: lead.stage === "lead" ? "contacted" : lead.stage });
  redirect(`/diagnostics/new?lead=${id}`);
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const lead = leadsRepo.get(id);
  if (!lead) notFound();
  const diagnostics = diagnosticsRepo.list().filter((d) => d.lead_id === id);
  const update = updateLead.bind(null, id);
  const convert = convertToClient.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={lead.company}
        description={`${lead.name} · ${lead.industry || "—"} · ${LEAD_SOURCE_LABELS[lead.source]}`}
        action={
          <div className="flex gap-2">
            <form action={convert}>
              <button className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
                转客户 + 新建诊断
              </button>
            </form>
            <Link href="/leads" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
              ← 返回看板
            </Link>
          </div>
        }
      />

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <Pill tone="accent">阶段 · {LEAD_STAGE_LABELS[lead.stage]}</Pill>
          <span className="text-xs text-forge-muted">最近更新 {fmtDate(lead.updated_at)}</span>
        </div>
        <form action={update} className="grid gap-3 md:grid-cols-2">
          <Field label="联系人">
            <Input name="name" defaultValue={lead.name} />
          </Field>
          <Field label="公司">
            <Input name="company" defaultValue={lead.company} />
          </Field>
          <Field label="行业">
            <Input name="industry" defaultValue={lead.industry} />
          </Field>
          <Field label="联系方式">
            <Input name="contact" defaultValue={lead.contact} />
          </Field>
          <Field label="渠道">
            <Select name="source" defaultValue={lead.source}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="阶段">
            <Select name="stage" defaultValue={lead.stage}>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="痛点描述">
              <Textarea name="pain_points" defaultValue={lead.pain_points} rows={3} />
            </Field>
          </div>
          <Field label="预算备注">
            <Input name="budget_note" defaultValue={lead.budget_note} />
          </Field>
          <Field label="下一步">
            <Input name="next_action" defaultValue={lead.next_action} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              保存修改
            </button>
          </div>
        </form>
      </Card>

      <Section title="相关诊断" description="此线索关联的诊断报告">
        {diagnostics.length === 0 ? (
          <Card className="text-center text-sm text-forge-muted">
            还没有诊断。
            <Link href={`/diagnostics/new?lead=${id}`} className="ml-2 text-accent-400 hover:underline">
              新建诊断 →
            </Link>
          </Card>
        ) : (
          <Card className="divide-y divide-forge-line/60 p-0">
            {diagnostics.map((d) => (
              <Link key={d.id} href={`/diagnostics/${d.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-forge-line/30">
                <div>
                  <div className="text-sm font-medium text-ink-50">{d.title}</div>
                  <div className="text-xs text-forge-muted">{fmtDate(d.updated_at)} · 状态 {d.status}</div>
                </div>
                <Pill tone={d.status === "ready" || d.status === "shared" ? "success" : "neutral"}>{d.status}</Pill>
              </Link>
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}
