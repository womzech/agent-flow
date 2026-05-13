import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, Field, Input, PageHeader, Pill, Section, Select } from "@/components/ui";
import { record } from "@/lib/audit";
import { requirePermission } from "@/lib/current-user";
import { hashPassword } from "@/lib/password";
import { permissionsRepo, rolesRepo, usersRepo } from "@/lib/repo";
import { fmtDate } from "@/lib/utils";

async function updateUser(id: number, formData: FormData) {
  "use server";
  const me = await requirePermission("write", "users");
  const current = usersRepo.get(id);
  if (!current) return;
  const patch: Parameters<typeof usersRepo.update>[1] = {
    name: String(formData.get("name") ?? current.name),
    role_id: Number(formData.get("role_id") || current.role_id),
    wecom_userid: (String(formData.get("wecom_userid") ?? current.wecom_userid ?? "").trim().toLowerCase()) || null,
    status: (formData.get("status") as "active" | "disabled") || current.status,
  };
  usersRepo.update(id, patch);
  record({ actor: me.user.email, action: "user.update", entity: "user", entityId: id });
  redirect(`/users/${id}`);
}

async function resetPassword(id: number, formData: FormData) {
  "use server";
  const me = await requirePermission("write", "users");
  const password = String(formData.get("new_password") ?? "");
  if (password.length < 8) return redirect(`/users/${id}?error=short-password`);
  const hashed = await hashPassword(password);
  usersRepo.update(id, hashed);
  record({ actor: me.user.email, action: "user.update", entity: "user", entityId: id, payload: { password_reset: true } });
  redirect(`/users/${id}?ok=password-reset`);
}

async function toggleStatus(id: number) {
  "use server";
  const me = await requirePermission("write", "users");
  const current = usersRepo.get(id);
  if (!current) return;
  const next = current.status === "active" ? "disabled" : "active";
  usersRepo.update(id, { status: next });
  record({ actor: me.user.email, action: "user.disable", entity: "user", entityId: id, payload: { new_status: next } });
  redirect(`/users/${id}`);
}

export default async function UserDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  await requirePermission("read", "users");
  const id = Number(params.id);
  const user = usersRepo.get(id);
  if (!user) notFound();
  const role = rolesRepo.get(user.role_id);
  const allRoles = rolesRepo.list();
  const userPerms = permissionsRepo.permissionsForUser(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={user.name}
        description={`${user.email} · ${role?.name ?? "未知角色"}`}
        action={
          <Link href="/users" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            ← 用户列表
          </Link>
        }
      />

      {searchParams.ok === "password-reset" ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">密码已重置</div>
      ) : null}
      {searchParams.error === "short-password" ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">密码至少 8 位</div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">状态</div>
          <div className="mt-2"><Pill tone={user.status === "active" ? "success" : "danger"}>{user.status}</Pill></div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">企业微信</div>
          <div className="mt-2 text-base text-ink-50">{user.wecom_userid || "—"}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">最近登录</div>
          <div className="mt-2 text-base text-ink-50">{fmtDate(user.last_login_at)}</div>
        </Card>
      </div>

      <Section title="资料 & 角色">
        <Card>
          <form action={updateUser.bind(null, id)} className="grid gap-3 md:grid-cols-2">
            <Field label="姓名"><Input name="name" defaultValue={user.name} /></Field>
            <Field label="邮箱（只读）"><Input defaultValue={user.email} disabled /></Field>
            <Field label="角色">
              <Select name="role_id" defaultValue={user.role_id}>
                {allRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.description}</option>
                ))}
              </Select>
            </Field>
            <Field label="企业微信 userid"><Input name="wecom_userid" defaultValue={user.wecom_userid ?? ""} placeholder="zhangsan" /></Field>
            <Field label="状态">
              <Select name="status" defaultValue={user.status}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </Select>
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">保存</button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="重置密码">
        <Card>
          <form action={resetPassword.bind(null, id)} className="flex gap-2">
            <input
              name="new_password"
              type="password"
              minLength={8}
              required
              placeholder="新密码（≥ 8 位）"
              className="flex-1 rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
            />
            <button type="submit" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
              重置
            </button>
          </form>
        </Card>
      </Section>

      <Section title="启用 / 停用">
        <Card className="flex items-center justify-between">
          <div className="text-sm text-forge-muted">当前状态：<Pill tone={user.status === "active" ? "success" : "danger"}>{user.status}</Pill></div>
          <form action={toggleStatus.bind(null, id)}>
            <button className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/20">
              {user.status === "active" ? "停用此账号" : "重新启用"}
            </button>
          </form>
        </Card>
      </Section>

      <Section title={`权限（${userPerms.size} 条）`} description="角色赋予的所有 read|write × resource 权限">
        <Card>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(userPerms).sort().map((p) => (
              <span key={p} className="rounded-full bg-accent-500/15 px-2 py-0.5 text-xs text-accent-300">{p}</span>
            ))}
          </div>
        </Card>
      </Section>
    </div>
  );
}
