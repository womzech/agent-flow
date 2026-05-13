import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill, Section } from "@/components/ui";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { listForUser, recentAttemptsForUser, revoke } from "@/lib/sessions";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function revokeSession(sessionId: number) {
  "use server";
  const me = await requireUser();
  const ok = revoke(me.user.id, sessionId);
  if (ok) record({ actor: me.user.email, action: "auth.logout", entity: "session", entityId: sessionId, payload: { reason: "user-revoked" } });
  redirect("/security/sessions");
}

export default async function SessionsPage() {
  const me = await requireUser();
  const sessions = listForUser(me.user.id);
  const attempts = recentAttemptsForUser(me.user.email, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="活跃会话"
        description="每条会话对应一个登录后未撤销的浏览器 cookie。撤销后该浏览器立即被踢出。"
        action={<Link href="/security" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">← 安全总览</Link>}
      />

      <Section title={`我的 session（${sessions.filter((s) => !s.revoked_at).length} 活跃 / ${sessions.length} 总计）`}>
        {sessions.length === 0 ? (
          <EmptyState title="还没有 session 记录" description="退出后重新登录，新 session 就会出现在这里。" />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                  <th className="p-3">IP</th>
                  <th className="p-3">User-Agent</th>
                  <th className="p-3">最近活动</th>
                  <th className="p-3">创建</th>
                  <th className="p-3">状态</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-forge-line/40">
                    <td className="p-3 font-mono text-xs text-accent-300">{s.ip || "—"}</td>
                    <td className="p-3 truncate text-xs text-forge-muted" style={{ maxWidth: 240 }}>{s.user_agent.slice(0, 60) || "—"}</td>
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(s.last_used_at)}</td>
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(s.created_at)}</td>
                    <td className="p-3">
                      {s.revoked_at ? <Pill tone="danger">已撤销</Pill> : <Pill tone="success">活跃</Pill>}
                    </td>
                    <td className="p-3 text-right">
                      {!s.revoked_at ? (
                        <form action={revokeSession.bind(null, s.id)}>
                          <button className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20">
                            撤销
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-forge-muted">{fmtDate(s.revoked_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="最近 10 次登录尝试" description="本邮箱在所有 IP 上的成败记录">
        {attempts.length === 0 ? (
          <EmptyState title="还没有尝试记录" />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                  <th className="p-3">时间</th>
                  <th className="p-3">IP</th>
                  <th className="p-3">结果</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a, i) => (
                  <tr key={i} className="border-b border-forge-line/40">
                    <td className="p-3 text-xs text-forge-muted">{fmtDate(a.at)}</td>
                    <td className="p-3 font-mono text-xs text-accent-300">{a.ip || "—"}</td>
                    <td className="p-3">
                      {a.ok ? <Pill tone="success">成功</Pill> : <Pill tone="danger">失败</Pill>}
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
