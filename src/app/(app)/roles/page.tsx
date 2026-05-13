import Link from "next/link";
import { Card, PageHeader, Pill, Section } from "@/components/ui";
import { requirePermission } from "@/lib/current-user";
import { permissionsRepo, rolesRepo, usersRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requirePermission("read", "users");
  const roles = rolesRepo.list();
  const allUsers = usersRepo.list();
  const userCountByRole = new Map<number, number>();
  for (const u of allUsers) userCountByRole.set(u.role_id, (userCountByRole.get(u.role_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="角色 & 权限矩阵"
        description="内置角色不可删；v0.3 暂不支持自定义角色，可通过修改 src/lib/schema.ts BUILT_IN_ROLES + 重启来扩展。"
        action={<Link href="/users" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">← 用户列表</Link>}
      />

      <Section title="内置角色">
        <div className="grid gap-3">
          {roles.map((r) => {
            const perms = permissionsRepo.forRole(r.id);
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-ink-50">{r.name}</span>
                      {r.is_system ? <Pill tone="accent">system</Pill> : <Pill tone="neutral">custom</Pill>}
                      <Pill tone="neutral">{userCountByRole.get(r.id) ?? 0} 个用户</Pill>
                    </div>
                    <div className="mt-1 text-sm text-forge-muted">{r.description}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {perms.map((p) => (
                    <span key={p.id} className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs text-accent-300">
                      {p.action}:{p.resource}
                    </span>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
