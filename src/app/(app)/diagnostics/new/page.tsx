import { redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { diagnosticsRepo, leadsRepo } from "@/lib/repo";

async function createDiagnostic(formData: FormData) {
  "use server";
  const company = String(formData.get("company") ?? "").trim();
  if (!company) return;
  const leadId = formData.get("lead_id") ? Number(formData.get("lead_id")) : null;
  const lead = leadId ? leadsRepo.get(leadId) : null;

  const workflows = [0, 1, 2]
    .map((i) => ({
      name: String(formData.get(`wf_${i}_name`) ?? "").trim(),
      currentMinutesPerOccurrence: Number(formData.get(`wf_${i}_minutes`) || 0),
      occurrencesPerMonth: Number(formData.get(`wf_${i}_freq`) || 0),
      headcountInvolved: Number(formData.get(`wf_${i}_headcount`) || 1),
      currentTools: String(formData.get(`wf_${i}_tools`) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      failureMode: String(formData.get(`wf_${i}_failure`) ?? "").trim() || undefined,
    }))
    .filter((w) => w.name);

  const questionnaire = {
    company: {
      name: company,
      industry: String(formData.get("industry") ?? "").trim(),
      size: String(formData.get("size") ?? "").trim(),
    },
    workflows,
    existingSystems: String(formData.get("existing_systems") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    budget: {
      oneTimeCents: Number(formData.get("budget_onetime") || 0) * 100,
      monthlyCents: Number(formData.get("budget_monthly") || 0) * 100,
      note: String(formData.get("budget_note") ?? "").trim() || undefined,
    },
    goals: String(formData.get("goals") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    riskTolerance: (formData.get("risk_tolerance") as "low" | "medium" | "high") || "medium",
    decisionMaker: String(formData.get("decision_maker") ?? "").trim() || undefined,
  };

  const title = String(formData.get("title") ?? "").trim() || `${company} · AI 工作流诊断`;
  const d = diagnosticsRepo.create({
    lead_id: leadId,
    client_id: lead?.client_id ?? null,
    title,
    questionnaire,
  });
  redirect(`/diagnostics/${d.id}`);
}

export default function NewDiagnosticPage({ searchParams }: { searchParams: { lead?: string } }) {
  const leadId = searchParams.lead ? Number(searchParams.lead) : null;
  const lead = leadId ? leadsRepo.get(leadId) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="新建诊断"
        description="问卷一次填完后即可生成报告；建议在客户电话中边问边填，避免事后补录失真。"
      />
      <form action={createDiagnostic} className="space-y-5">
        {lead ? <input type="hidden" name="lead_id" value={lead.id} /> : null}

        <Card>
          <div className="mb-3 text-sm font-semibold text-ink-100">1. 基本信息</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="诊断标题">
              <Input name="title" defaultValue={lead ? `${lead.company} · AI 工作流诊断` : ""} placeholder="客户公司 · AI 工作流诊断" />
            </Field>
            <Field label="公司名 *">
              <Input name="company" required defaultValue={lead?.company || ""} />
            </Field>
            <Field label="行业">
              <Input name="industry" defaultValue={lead?.industry || ""} />
            </Field>
            <Field label="规模 (人数 / 营收)">
              <Input name="size" placeholder="30 人 / 年营收 4000 万" />
            </Field>
            <Field label="决策人">
              <Input name="decision_maker" placeholder="张总 / 老板娘 / IT 经理" />
            </Field>
            <Field label="风险偏好">
              <Select name="risk_tolerance" defaultValue="medium">
                <option value="low">保守</option>
                <option value="medium">中等</option>
                <option value="high">激进</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-ink-100">2. 高频重复工作流（最多 3 个）</div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="mb-3 grid gap-3 rounded-md border border-forge-line/60 p-3 md:grid-cols-2">
              <div className="md:col-span-2 text-xs text-forge-muted">工作流 #{i + 1}</div>
              <Field label="名称">
                <Input name={`wf_${i}_name`} placeholder="回复客户询盘 / 整理月度报价单" />
              </Field>
              <Field label="单次耗时（分钟）">
                <Input name={`wf_${i}_minutes`} type="number" min={0} placeholder="20" />
              </Field>
              <Field label="月发生次数">
                <Input name={`wf_${i}_freq`} type="number" min={0} placeholder="200" />
              </Field>
              <Field label="参与人数">
                <Input name={`wf_${i}_headcount`} type="number" min={1} defaultValue={1} />
              </Field>
              <Field label="当前工具（逗号分隔）">
                <Input name={`wf_${i}_tools`} placeholder="Excel,微信群,孚盟CRM" />
              </Field>
              <Field label="主要失败模式">
                <Input name={`wf_${i}_failure`} placeholder="新人找不到老款产品资料" />
              </Field>
            </div>
          ))}
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-ink-100">3. 现有系统 & 预算</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="现有系统（逗号分隔）" hint="Excel / 钉钉 / 飞书 / 孚盟 / 用友 ...">
              <Input name="existing_systems" placeholder="Excel,钉钉,阿里国际站" />
            </Field>
            <Field label="一次性预算（元）">
              <Input name="budget_onetime" type="number" min={0} placeholder="50000" />
            </Field>
            <Field label="月度预算（元）">
              <Input name="budget_monthly" type="number" min={0} placeholder="2000" />
            </Field>
            <Field label="付款条件备注">
              <Input name="budget_note" placeholder="可预付 50% / 走对公审批 7 天" />
            </Field>
            <div className="md:col-span-2">
              <Field label="目标（每行一条）">
                <Textarea name="goals" rows={3} placeholder="缩短询盘响应时间&#10;新业务员 2 周内能独立处理 80% 询盘" />
              </Field>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
            保存问卷
          </button>
        </div>
      </form>
    </div>
  );
}
