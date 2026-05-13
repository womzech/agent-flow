import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { create as createToken, listForUser, revoke } from "@/lib/api-tokens";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function generateToken(formData: FormData) {
  "use server";
  const me = await requireUser();
  const name = String(formData.get("name") ?? "").trim() || "未命名 token";
  const created = createToken(me.user.id, name);
  record({ actor: me.user.email, action: "user.update", entity: "api_token", entityId: created.id, payload: { name, prefix: created.token_prefix } });
  // Redirect with the plaintext in the query — it's the one and only time it
  // will ever be shown. We deliberately keep it in the URL only so a browser
  // history scrub or a quick copy ends the exposure window.
  redirect(`/api-tokens?just_created=${encodeURIComponent(created.plaintext)}&jid=${created.id}`);
}

async function revokeToken(tokenId: number) {
  "use server";
  const me = await requireUser();
  const ok = revoke(me.user.id, tokenId);
  if (ok) {
    record({ actor: me.user.email, action: "user.update", entity: "api_token", entityId: tokenId, payload: { revoked: true } });
  }
  redirect("/api-tokens");
}

export default async function ApiTokensPage({ searchParams }: { searchParams: { just_created?: string; jid?: string } }) {
  const me = await requireUser();
  const tokens = listForUser(me.user.id);
  const justCreated = searchParams.just_created;
  const justCreatedId = searchParams.jid ? Number(searchParams.jid) : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="API Tokens"
        description={`供 n8n / Zapier / curl 等程序化访问使用。当前用户：${me.user.email}（${me.role.name}）。Token 继承你的角色权限。`}
      />

      {justCreated ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300">⚠️ 仅显示一次</div>
          <div className="mb-3 text-sm text-ink-100">
            请立刻复制保存。关闭此页后，AgentFlow 无法再次显示此 token 的明文 — 只能在密钥管理软件中找回，或撤销重建。
          </div>
          <pre className="overflow-x-auto rounded-md border border-amber-500/30 bg-forge p-3 text-sm text-amber-200">
            {justCreated}
          </pre>
          <div className="mt-3 text-xs text-forge-muted">
            示例使用：<code className="text-accent-300">curl -H &quot;Authorization: Bearer {justCreated.slice(0, 11)}...&quot; https://your-host/api/health</code>
          </div>
          <div className="mt-3">
            <Link href="/api-tokens" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-xs hover:bg-forge-line">
              我已复制，关闭提示
            </Link>
          </div>
        </Card>
      ) : null}

      <Section title="创建新 token">
        <Card>
          <form action={generateToken} className="flex flex-wrap items-end gap-3">
            <label className="flex-1">
              <div className="mb-1 text-sm text-ink-100">名称（用于日后识别用途）</div>
              <input
                name="name"
                required
                placeholder="n8n production / zapier sync ..."
                className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
              />
            </label>
            <button type="submit" className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              生成 token
            </button>
          </form>
          <p className="mt-3 text-xs text-forge-muted">
            Token 格式：<code className="text-accent-300">agf_</code> + 32 位随机 base32。明文仅出现一次；服务器只保存 SHA-256 摘要。
          </p>
        </Card>
      </Section>

      <Section title={`我的 token（${tokens.length}）`}>
        {tokens.length === 0 ? (
          <EmptyState title="还没有 token" description="点上面的「生成 token」创建第一个。" />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                  <th className="p-3">名称</th>
                  <th className="p-3">前缀</th>
                  <th className="p-3">最近使用</th>
                  <th className="p-3">创建时间</th>
                  <th className="p-3">状态</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id} className={`border-b border-forge-line/40 ${t.id === justCreatedId ? "bg-accent-500/5" : ""}`}>
                    <td className="p-3 text-ink-50">{t.name}</td>
                    <td className="p-3 font-mono text-xs text-accent-300">{t.token_prefix}…</td>
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(t.last_used_at) || "—"}</td>
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(t.created_at)}</td>
                    <td className="p-3">
                      {t.revoked_at ? <Pill tone="danger">revoked</Pill> : <Pill tone="success">active</Pill>}
                    </td>
                    <td className="p-3 text-right">
                      {!t.revoked_at ? (
                        <form action={revokeToken.bind(null, t.id)}>
                          <button className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20">
                            撤销
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-forge-muted">{fmtDate(t.revoked_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="使用建议">
        <Card>
          <ul className="ml-5 list-disc space-y-1 text-sm text-ink-200">
            <li>把 token 当成密码：不要写进 git、不要分享到群里。</li>
            <li>不同集成用不同 token（n8n 一个、Zapier 一个），便于追踪使用情况。</li>
            <li>若团队成员离职或 token 泄漏，立即在此页面 <span className="text-rose-300">撤销</span>。</li>
            <li>v0.4 还未支持 token 级 scope 收窄；token 继承当前角色的全部权限。</li>
          </ul>
        </Card>
      </Section>
    </div>
  );
}
