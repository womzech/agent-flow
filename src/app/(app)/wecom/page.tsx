import { Card, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { list as listAuditEvents } from "@/lib/audit";
import { requirePermission } from "@/lib/current-user";
import { usersRepo } from "@/lib/repo";
import { isConfigured } from "@/lib/wecom/api";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WecomAdminPage() {
  await requirePermission("write", "wecom");
  const cfg = isConfigured();
  const events = listAuditEvents({ entity: "wecom", limit: 100 });
  const bound = usersRepo.list().filter((u) => !!u.wecom_userid);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="企业微信 / WeCom"
        description="自建应用回调 + 主动推送 + 用户绑定情况一览。"
      />

      <Section title="配置状态">
        <Card>
          <div className="flex items-center gap-2">
            <Pill tone={cfg ? "success" : "warning"}>{cfg ? "已配置" : "未配置"}</Pill>
            <span className="text-sm text-forge-muted">
              {cfg
                ? "WECOM_CORP_ID / AGENT_ID / SECRET / TOKEN / AES_KEY 均已设置。"
                : "请在 .env.local 配置全部 5 个 WECOM_* 变量后重启。"}
            </span>
          </div>
          <div className="mt-3 grid gap-1 text-xs text-forge-muted">
            <div>回调 URL：<code className="text-accent-300">{process.env.WECOM_CALLBACK_URL || "<your-base>/api/wecom/callback"}</code></div>
            <div>默认推送对象：<code className="text-accent-300">{process.env.WECOM_DEFAULT_NOTIFY_USERS || "@all"}</code></div>
          </div>
        </Card>
      </Section>

      <Section title={`已绑定用户（${bound.length}）`} description="企业微信 userid ↔ AgentForge user 的映射；在 /users/[id] 编辑">
        {bound.length === 0 ? (
          <EmptyState title="还没有用户绑定企业微信 userid" description="去 /users/[id] 编辑账号，填入 wecom_userid 字段。" />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                  <th className="p-3">姓名</th>
                  <th className="p-3">AgentForge 邮箱</th>
                  <th className="p-3">企业微信 userid</th>
                  <th className="p-3">角色</th>
                  <th className="p-3">最近登录</th>
                </tr>
              </thead>
              <tbody>
                {bound.map((u) => (
                  <tr key={u.id} className="border-b border-forge-line/40">
                    <td className="p-3 text-ink-50">{u.name}</td>
                    <td className="p-3 text-xs text-forge-muted">{u.email}</td>
                    <td className="p-3 font-mono text-xs text-accent-300">{u.wecom_userid}</td>
                    <td className="p-3"><Pill tone="neutral">role_id={u.role_id}</Pill></td>
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(u.last_login_at) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title={`最近 WeCom 事件（${events.length}）`} description="完整记录见 /audit">
        {events.length === 0 ? (
          <EmptyState title="还没有 WeCom 事件" description="配置完毕后，URL 验证、消息接收、回复、推送都会出现在这里。" />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                  <th className="p-3">时间</th>
                  <th className="p-3">类型</th>
                  <th className="p-3">细节</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 30).map((e) => (
                  <tr key={e.id} className="border-b border-forge-line/40">
                    <td className="p-3 text-forge-muted">{fmtDate(e.at)}</td>
                    <td className="p-3">
                      <Pill tone={
                        e.action === "wecom.fail" ? "danger"
                          : e.action === "wecom.verify" ? "accent"
                          : e.action === "wecom.receive" ? "neutral"
                          : e.action === "wecom.reply" || e.action === "wecom.push" ? "success"
                          : "neutral"
                      }>{e.action}</Pill>
                    </td>
                    <td className="p-3 text-xs text-ink-200">
                      <code className="text-forge-muted">{e.payload_json.length > 100 ? e.payload_json.slice(0, 100) + "…" : e.payload_json}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </div>
  );
}
