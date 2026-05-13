import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requirePermission } from "@/lib/current-user";
import { rolesRepo, usersRepo } from "@/lib/repo";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePermission("read", "users");
  const users = usersRepo.list();
  const roles = new Map(rolesRepo.list().map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="用户管理"
        description="多用户 RBAC：每个团队成员一行，绑定角色 + 可选企业微信 userid。"
        action={
          <Link href="/users/new" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
            + 新建用户
          </Link>
        }
      />
      {users.length === 0 ? (
        <EmptyState
          title="还没有用户"
          description="设置 AGENTFORGE_PASSWORD 重启可自动创建 admin@local；或手动新建。"
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forge-line/60 text-left text-xs uppercase tracking-wider text-forge-muted">
                <th className="p-3">姓名 / 邮箱</th>
                <th className="p-3">角色</th>
                <th className="p-3">企业微信</th>
                <th className="p-3">状态</th>
                <th className="p-3">最近登录</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-forge-line/40">
                  <td className="p-3">
                    <div className="text-ink-50">{u.name}</div>
                    <div className="text-xs text-forge-muted">{u.email}</div>
                  </td>
                  <td className="p-3">
                    <Pill tone={u.role_id === 1 ? "accent" : "neutral"}>{roles.get(u.role_id) ?? `#${u.role_id}`}</Pill>
                  </td>
                  <td className="p-3 text-xs text-forge-muted">{u.wecom_userid || "—"}</td>
                  <td className="p-3"><Pill tone={u.status === "active" ? "success" : "danger"}>{u.status}</Pill></td>
                  <td className="p-3 text-xs text-forge-muted">{fmtDate(u.last_login_at) || "—"}</td>
                  <td className="p-3 text-right">
                    <Link href={`/users/${u.id}`} className="text-xs text-accent-400 hover:underline">编辑 →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 text-xs text-forge-muted">
        权限矩阵：<Link href="/roles" className="text-accent-400 hover:underline">查看角色 → 权限映射</Link>。所有用户管理操作均会进入审计日志。
      </div>
    </div>
  );
}
