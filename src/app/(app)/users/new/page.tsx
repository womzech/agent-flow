import { redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { record } from "@/lib/audit";
import { requirePermission } from "@/lib/current-user";
import { hashPassword } from "@/lib/password";
import { rolesRepo, usersRepo } from "@/lib/repo";

async function createUser(formData: FormData) {
  "use server";
  const me = await requirePermission("write", "users");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const roleId = Number(formData.get("role_id"));
  const wecomUserid = String(formData.get("wecom_userid") ?? "").trim().toLowerCase() || null;
  if (!email || !name || !password || !roleId) {
    return redirect("/users/new?error=missing");
  }
  if (password.length < 8) {
    return redirect("/users/new?error=short-password");
  }
  if (usersRepo.getByEmail(email)) {
    return redirect("/users/new?error=duplicate-email");
  }
  if (wecomUserid && usersRepo.getByWecomUserid(wecomUserid)) {
    return redirect("/users/new?error=duplicate-wecom");
  }
  const hashed = await hashPassword(password);
  const u = usersRepo.create({
    email, name, wecom_userid: wecomUserid, role_id: roleId, ...hashed,
  });
  record({ actor: me.user.email, action: "user.create", entity: "user", entityId: u.id, payload: { email, role_id: roleId } });
  redirect(`/users/${u.id}`);
}

export default async function NewUserPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePermission("write", "users");
  const roles = rolesRepo.list();

  const errorMsg = {
    missing: "请填全邮箱 / 姓名 / 密码 / 角色",
    "short-password": "密码至少 8 位",
    "duplicate-email": "邮箱已存在",
    "duplicate-wecom": "该企业微信 userid 已绑定其他账号",
  }[searchParams?.error ?? ""];

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="新建用户" description="为团队成员创建账号，分配角色与可选企业微信绑定。" />
      <Card>
        <form action={createUser} className="grid gap-4">
          <Field label="姓名 *"><Input name="name" required placeholder="张三" /></Field>
          <Field label="邮箱 *"><Input name="email" type="email" required placeholder="zhangsan@company.com" /></Field>
          <Field label="初始密码 *" hint="至少 8 位；用户登录后可在 /users/[id] 自助重置">
            <Input name="password" type="password" required minLength={8} />
          </Field>
          <Field label="角色 *">
            <Select name="role_id" defaultValue="">
              <option value="" disabled>选择角色</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name} · {r.description}</option>
              ))}
            </Select>
          </Field>
          <Field label="企业微信 userid (可选)" hint="将此用户绑定到企业微信账号，用于通过企微 @ 机器人">
            <Input name="wecom_userid" placeholder="zhangsan" />
          </Field>
          {errorMsg ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{errorMsg}</div>
          ) : null}
          <div className="flex justify-end">
            <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              创建用户
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
