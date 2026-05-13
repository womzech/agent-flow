import Link from "next/link";
import { Card, PageHeader, Pill, Section } from "@/components/ui";
import { listForUser as listApiTokens } from "@/lib/api-tokens";
import { requireUser } from "@/lib/current-user";
import { listForUser as listSessions, recentAttemptsForUser } from "@/lib/sessions";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SecurityOverviewPage() {
  const me = await requireUser();
  const sessions = listSessions(me.user.id);
  const activeSessions = sessions.filter((s) => !s.revoked_at);
  const tokens = listApiTokens(me.user.id);
  const activeTokens = tokens.filter((t) => !t.revoked_at);
  const attempts = recentAttemptsForUser(me.user.email, 20);
  const recentFails = attempts.filter((a) => a.ok === 0).length;
  const totpEnabled = me.user.totp_enabled === 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="安全总览"
        description={`${me.user.email} 的安全态势：2FA / sessions / API tokens / 最近登录尝试。`}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <SecurityCard
          title="两步验证"
          status={totpEnabled ? "good" : "bad"}
          value={totpEnabled ? "已启用" : "未启用"}
          href="/security/2fa"
          hint={totpEnabled ? "TOTP + 30s + 6 digits" : "建议立即启用"}
        />
        <SecurityCard
          title="活跃会话"
          status={activeSessions.length <= 3 ? "good" : "warn"}
          value={String(activeSessions.length)}
          href="/security/sessions"
          hint={activeSessions.length === 0 ? "无活跃会话" : "查看 / 撤销"}
        />
        <SecurityCard
          title="API tokens"
          status="info"
          value={String(activeTokens.length)}
          href="/api-tokens"
          hint="供 n8n / Zapier 用"
        />
        <SecurityCard
          title="最近 20 次登录"
          status={recentFails > 3 ? "warn" : "good"}
          value={`${attempts.length - recentFails} ok / ${recentFails} 失败`}
          href="/security/sessions"
          hint="包含所有 IP"
        />
      </div>

      <Section title="快速检查清单" description="勾选所有项即可达到 v0.4 推荐安全基线">
        <Card>
          <ul className="space-y-2 text-sm">
            <Check ok={totpEnabled} label="启用两步验证（强烈推荐 owner / consultant）" href="/security/2fa" />
            <Check ok={activeSessions.length > 0} label={`至少 1 个活跃 session（当前 ${activeSessions.length}）`} href="/security/sessions" />
            <Check
              ok={recentFails <= 2}
              label={`最近 20 次登录失败次数 ≤ 2（当前 ${recentFails}）`}
              href="/security/sessions"
              warnOnly
            />
            <Check
              ok={tokens.every((t) => t.last_used_at || t.revoked_at)}
              label="所有 API token 都有 last_used_at 或已撤销（避免悬挂凭证）"
              href="/api-tokens"
              warnOnly
            />
          </ul>
        </Card>
      </Section>

      <Section title="链接">
        <Card>
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            <li><Link href="/security/2fa" className="text-accent-400 hover:underline">→ 两步验证 (TOTP)</Link></li>
            <li><Link href="/security/sessions" className="text-accent-400 hover:underline">→ 活跃会话 + 登录历史</Link></li>
            <li><Link href="/api-tokens" className="text-accent-400 hover:underline">→ 我的 API tokens</Link></li>
            <li><Link href="/audit" className="text-accent-400 hover:underline">→ 全局审计日志（需 read:audit 权限）</Link></li>
          </ul>
        </Card>
      </Section>
    </div>
  );
}

function SecurityCard({ title, status, value, href, hint }: { title: string; status: "good" | "warn" | "bad" | "info"; value: string; href: string; hint?: string }) {
  const tone = status === "good" ? "success" : status === "warn" ? "warning" : status === "bad" ? "danger" : "accent";
  return (
    <Link href={href}>
      <Card className="cursor-pointer transition hover:border-accent-500">
        <div className="text-xs uppercase tracking-wider text-forge-muted">{title}</div>
        <div className="mt-2 text-2xl font-semibold text-ink-50">{value}</div>
        <div className="mt-2"><Pill tone={tone}>{status === "good" ? "OK" : status === "warn" ? "注意" : status === "bad" ? "未启用" : "信息"}</Pill></div>
        {hint ? <div className="mt-2 text-xs text-forge-muted">{hint}</div> : null}
      </Card>
    </Link>
  );
}

function Check({ ok, label, href, warnOnly }: { ok: boolean; label: string; href: string; warnOnly?: boolean }) {
  const Icon = ok ? "✅" : warnOnly ? "⚠️" : "❌";
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 text-ink-200 hover:text-ink-50">
        <span aria-hidden>{Icon}</span>
        <span>{label}</span>
      </Link>
    </li>
  );
}

void fmtDate;  // imported for future-use; tree-shaken in build
