import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, constantTimeEqual, expectedExp, signSession } from "@/lib/auth";
import { record } from "@/lib/audit";
import { getDbReady } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rolesRepo, usersRepo } from "@/lib/repo";
import { consume, ipFromHeaders } from "@/lib/ratelimit";

async function login(formData: FormData) {
  "use server";
  await getDbReady();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  const userCount = usersRepo.count();

  // Rate limit per (ip + email) AND per ip alone (defense in depth).
  const ip = ipFromHeaders(headers());
  const composite = `${ip}::${email || "_anon"}`;
  const v1 = consume({ route: "login", key: composite, limit: 5, windowMs: 15 * 60 * 1000 });
  const v2 = consume({ route: "login-ip", key: ip, limit: 20, windowMs: 15 * 60 * 1000 });
  if (!v1.ok || !v2.ok) {
    record({ action: "auth.fail", entity: "session", payload: { reason: "rate-limited", ip, email } });
    return redirect(`/login?error=1&hint=rate-limited&next=${encodeURIComponent(next)}`);
  }

  // Case 1: e-mail provided → multi-user login path.
  if (email) {
    const user = email ? usersRepo.getByEmail(email) : null;
    if (!user || user.status !== "active") {
      record({ action: "auth.fail", entity: "session", payload: { email, reason: "no-user" } });
      await sleep(1500);
      return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    }
    const ok = await verifyPassword(password, user);
    if (!ok) {
      record({ action: "auth.fail", entity: "session", entityId: user.id, payload: { email, reason: "bad-password" } });
      await sleep(1500);
      return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    }
    await setSession(user.id);
    usersRepo.touchLogin(user.id);
    record({ action: "auth.login", entity: "session", entityId: user.id, payload: { email } });
    return redirect(next);
  }

  // Case 2: legacy single-password fallback. Works when:
  //  - users table is empty (first-run before bootstrap created admin), OR
  //  - operator wants to skip typing the email and use the env password.
  // In both cases we look up admin@local (created by bootstrap from
  // AGENTFORGE_PASSWORD) and require the same password.
  if (!process.env.AGENTFORGE_PASSWORD) {
    await sleep(800);
    return redirect(`/login?error=1&next=${encodeURIComponent(next)}&hint=no-password-env`);
  }
  if (!constantTimeEqual(password, process.env.AGENTFORGE_PASSWORD)) {
    record({ action: "auth.fail", entity: "session", payload: { reason: "legacy-password-mismatch" } });
    await sleep(1500);
    return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  // Either find or fall back to admin@local (bootstrap creates it).
  const admin = usersRepo.getByEmail("admin@local");
  if (admin) {
    await setSession(admin.id);
    usersRepo.touchLogin(admin.id);
    record({ action: "auth.login", entity: "session", entityId: admin.id, payload: { mode: "legacy" } });
    return redirect(next);
  }
  // Last-resort: no users yet, no admin row — issue a session with sub=0 so
  // middleware approves but no user record exists. This shouldn't happen in
  // practice because bootstrap runs eagerly, but it keeps the login UX honest
  // for ops who set AGENTFORGE_PASSWORD AFTER the first page load.
  await setSession(undefined);
  record({ action: "auth.login", entity: "session", payload: { mode: "legacy-no-user" } });
  return redirect(next);
  void userCount;
}

async function setSession(sub: number | undefined) {
  const token = await signSession({ exp: expectedExp(), sub });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string; hint?: string } }) {
  await getDbReady();
  const error = !!searchParams?.error;
  const next = searchParams?.next || "/";
  const hint = searchParams?.hint;
  const isEmptyDB = usersRepo.count() === 0;
  const hasEnvPassword = !!process.env.AGENTFORGE_PASSWORD;
  // Surface role/user info to help operators understand the deployment state
  const builtinRoles = rolesRepo.list().filter((r) => r.is_system === 1);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-forge-line bg-forge-panel/60 p-6 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-500 font-bold text-forge">AF</div>
          <div>
            <div className="text-base font-semibold text-ink-50">AgentForge</div>
            <div className="text-xs text-forge-muted">智造工坊 · v0.3</div>
          </div>
        </div>
        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm text-ink-100">邮箱</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder={isEmptyDB && hasEnvPassword ? "留空使用环境变量密码" : "you@company.com"}
              className="mt-1 w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-100">密码</span>
            <input
              autoFocus
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
              placeholder="••••••••"
            />
          </label>
          {error ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {hint === "no-password-env"
                ? "服务器未配置 AGENTFORGE_PASSWORD，且账户不存在。"
                : hint === "rate-limited"
                ? "登录请求过于频繁，请 15 分钟后再试。"
                : "邮箱或密码错误。"}
            </div>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400"
          >
            登录
          </button>
        </form>
        <div className="mt-4 space-y-2 text-xs text-forge-muted">
          <p>
            🛡️ 多用户 RBAC 模式：邮箱 + 密码登录。内置角色 {builtinRoles.map((r) => r.name).join(" / ") || "正在加载"}。
          </p>
          {hasEnvPassword ? (
            <p>
              💡 兼容模式：留空邮箱并输入 <code className="text-accent-300">AGENTFORGE_PASSWORD</code> 也可登录（owner 身份）。
            </p>
          ) : (
            <p className="text-amber-300">
              ⚠️ 未设置 <code>AGENTFORGE_PASSWORD</code>，首次登录前请在 <code>.env.local</code> 中配置。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
