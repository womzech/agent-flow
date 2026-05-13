import { redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { record } from "@/lib/audit";
import { requirePermission } from "@/lib/current-user";
import { leadsRepo } from "@/lib/repo";
import { notifyEventAsync } from "@/lib/wecom/notify";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS, LEAD_STAGES, LEAD_STAGE_LABELS, type LeadSource, type LeadStage } from "@/lib/schema";

async function createLead(formData: FormData) {
  "use server";
  const u = await requirePermission("write", "leads");
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  if (!name || !company) return;
  const created = leadsRepo.create({
    name,
    company,
    industry: String(formData.get("industry") ?? "").trim(),
    contact: String(formData.get("contact") ?? "").trim(),
    source: (formData.get("source") as LeadSource) || "unknown",
    stage: (formData.get("stage") as LeadStage) || "lead",
    pain_points: String(formData.get("pain_points") ?? "").trim(),
    budget_note: String(formData.get("budget_note") ?? "").trim(),
    next_action: String(formData.get("next_action") ?? "").trim(),
  });
  record({ actor: u.user.email, action: "lead.create", entity: "lead", entityId: created.id, payload: { company: created.company } });
  notifyEventAsync({
    kind: "lead.create",
    lead: { id: created.id, company: created.company, name: created.name, industry: created.industry, pain_points: created.pain_points, source: created.source },
    actor: u.user.name,
  });
  redirect(`/leads/${created.id}`);
}

export default async function NewLeadPage() {
  await requirePermission("write", "leads");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="新建线索" description="把刚刚加到微信 / 闲鱼私聊里的潜在客户录进来。" />
      <Card>
        <form action={createLead} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="联系人 *">
              <Input name="name" required placeholder="陈晓刚" />
            </Field>
            <Field label="公司名 *">
              <Input name="company" required placeholder="深圳越达玩具有限公司" />
            </Field>
            <Field label="行业">
              <Input name="industry" placeholder="玩具外贸 / 工程安装 / 电商 ..." />
            </Field>
            <Field label="联系方式">
              <Input name="contact" placeholder="微信 / 手机 / 邮箱" />
            </Field>
            <Field label="渠道">
              <Select name="source" defaultValue="unknown">
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>{LEAD_SOURCE_LABELS[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="阶段">
              <Select name="stage" defaultValue="lead">
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="痛点描述" hint="客户用自己的话描述每天最烦的事。越具体越好。">
            <Textarea name="pain_points" placeholder="业务员每天花 2 小时回复阿里国际站询盘..." rows={3} />
          </Field>
          <Field label="预算 / 决策线索">
            <Input name="budget_note" placeholder="老板提过愿意花 1-3 万；财务审批 7 天周期" />
          </Field>
          <Field label="下一步">
            <Input name="next_action" placeholder="周五电话深聊 / 周三 demo" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              保存
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
