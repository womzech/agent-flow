import { Card, Field, Input, PageHeader, Pill, Section } from "@/components/ui";
import { settingsRepo } from "@/lib/repo";
import { DEFAULT_MODEL } from "@/lib/anthropic";
import { isConfigured as isWecomConfigured } from "@/lib/wecom/api";
import { redirect } from "next/navigation";

async function saveSettings(formData: FormData) {
  "use server";
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") settingsRepo.set(k, v);
  }
  redirect("/settings?saved=1");
}

export const dynamic = "force-dynamic";

export default function SettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const all = settingsRepo.all();
  const apiKeyHint = process.env.ANTHROPIC_API_KEY ? "环境变量已配置（推荐）" : "未配置 — 通过 .env.local 配置后重启";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="设置 Settings" description="顾问个人信息 + AI 模型偏好。" />
      {searchParams?.saved ? <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">已保存</div> : null}

      <Section title="AI 模型">
        <Card>
          <div className="grid gap-3">
            <Field label="ANTHROPIC_API_KEY" hint={apiKeyHint}>
              <Input placeholder="sk-ant-xxx" disabled defaultValue={process.env.ANTHROPIC_API_KEY ? "（已通过环境变量配置）" : ""} />
            </Field>
            <Field label="默认模型" hint={`当前默认：${DEFAULT_MODEL}`}>
              <Input disabled defaultValue={DEFAULT_MODEL} />
            </Field>
          </div>
          <p className="mt-3 text-xs text-forge-muted">
            出于安全考虑，API key 必须通过环境变量（.env.local）配置，不写入数据库。
          </p>
        </Card>
      </Section>

      <Section title="企业微信" description="v0.3 新增：双向交互 + 主动推送">
        <Card>
          <div className="flex items-center gap-3 text-sm">
            <Pill tone={isWecomConfigured() ? "success" : "warning"}>{isWecomConfigured() ? "已配置" : "未配置"}</Pill>
            <span className="text-forge-muted">
              {isWecomConfigured()
                ? "WECOM_CORP_ID / AGENT_ID / SECRET / TOKEN / AES_KEY 已通过环境变量配置。"
                : "需要在 .env.local 配置 5 个 WECOM_* 环境变量后重启。"}
            </span>
          </div>
          <div className="mt-3 rounded-md border border-forge-line/60 bg-forge p-3">
            <div className="text-xs uppercase tracking-wider text-forge-muted">回调 URL</div>
            <div className="mt-1 break-all font-mono text-xs text-accent-300">
              {process.env.WECOM_CALLBACK_URL || "<your-base>/api/wecom/callback"}
            </div>
            <div className="mt-2 text-xs text-forge-muted">
              在企业微信「应用管理 → 自建应用 → 接收消息」中粘贴此 URL，token / EncodingAESKey 与 .env 保持一致。
            </div>
          </div>
        </Card>
      </Section>

      <Section title="顾问署名">
        <Card>
          <form action={saveSettings} className="grid gap-3 md:grid-cols-2">
            <Field label="姓名"><Input name="consultant_name" defaultValue={all.consultant_name ?? process.env.AGENTFORGE_CONSULTANT_NAME ?? ""} /></Field>
            <Field label="职位"><Input name="consultant_title" defaultValue={all.consultant_title ?? process.env.AGENTFORGE_CONSULTANT_TITLE ?? "AI 工作流顾问"} /></Field>
            <Field label="电话"><Input name="consultant_phone" defaultValue={all.consultant_phone ?? process.env.AGENTFORGE_CONSULTANT_PHONE ?? ""} /></Field>
            <Field label="邮箱"><Input name="consultant_email" defaultValue={all.consultant_email ?? process.env.AGENTFORGE_CONSULTANT_EMAIL ?? ""} /></Field>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
                保存
              </button>
            </div>
          </form>
        </Card>
      </Section>
    </div>
  );
}
