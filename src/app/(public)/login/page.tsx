import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, constantTimeEqual, expectedExp, signSession } from "@/lib/auth";
import { record } from "@/lib/audit";
import { getDbReady } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { rolesRepo, usersRepo } from "@/lib/repo";
import { consume, ipFromHeaders } from "@/lib/ratelimit";
import { create as createSession, isLockedOut, recordAttempt } from "@/lib/sessions";
import { fromBase32, verify as verifyTotp } from "@/lib/totp";

const PENDING_2FA_COOKIE = "agentflow_pending_2fa";
const PENDING_TTL_SECONDS = 5 * 60;

async function login(formData: FormData) {
  "use server";
  await getDbReady();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  const userCount = usersRepo.count();

  // Rate limit per (ip + email) AND per ip alone (defense in depth).
  const ip = ipFromHeaders(headers());
  const userAgent = headers().get("user-agent") ?? "";
  const composite = `${ip}::${email || "_anon"}`;
  const v1 = consume({ route: "login", key: composite, limit: 5, windowMs: 15 * 60 * 1000 });
  const v2 = consume({ route: "login-ip", key: ip, limit: 20, windowMs: 15 * 60 * 1000 });
  if (!v1.ok || !v2.ok) {
    record({ action: "auth.fail", entity: "session", payload: { reason: "rate-limited", ip, email } });
    return redirect(`/login?error=1&hint=rate-limited&next=${encodeURIComponent(next)}`);
  }

  // Account lockout: 5 failed (email + ip) in 15 minutes → block until window expires.
  if (email && isLockedOut({ email, ip })) {
    record({ action: "auth.fail", entity: "session", payload: { reason: "locked-out", ip, email } });
    return redirect(`/login?error=1&hint=locked-out&next=${encodeURIComponent(next)}`);
  }

  // Case 1: e-mail provided → multi-user login path.
  if (email) {
    const user = email ? usersRepo.getByEmail(email) : null;
    if (!user || user.status !== "active") {
      recordAttempt({ email, ip, ok: false });
      record({ action: "auth.fail", entity: "session", payload: { email, reason: "no-user" } });
      await sleep(1500);
      return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    }
    const ok = await verifyPassword(password, user);
    if (!ok) {
      recordAttempt({ email, ip, ok: false });
      record({ action: "auth.fail", entity: "session", entityId: user.id, payload: { email, reason: "bad-password" } });
      await sleep(1500);
      return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
    }
    // First factor OK. If 2FA is enabled, defer the session and ask for code.
    if (user.totp_enabled) {
      const token = await signSession({ exp: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS, sub: user.id });
      cookies().set(PENDING_2FA_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: PENDING_TTL_SECONDS,
        path: "/",
      });
      record({ action: "auth.login", entity: "session", entityId: user.id, payload: { email, ip, stage: "totp-pending" } });
      return redirect(`/login?stage=totp&next=${encodeURIComponent(next)}`);
    }
    recordAttempt({ email, ip, ok: true });
    await setSessionWith(user.id, ip, userAgent);
    usersRepo.touchLogin(user.id);
    record({ action: "auth.login", entity: "session", entityId: user.id, payload: { email, ip } });
    return redirect(next);
  }

  // Case 2: legacy single-password fallback. Works when:
  //  - users table is empty (first-run before bootstrap created admin), OR
  //  - operator wants to skip typing the email and use the env password.
  // In both cases we look up admin@local (created by bootstrap from
  // AGENTFLOW_PASSWORD) and require the same password.
  if (!process.env.AGENTFLOW_PASSWORD) {
    await sleep(800);
    return redirect(`/login?error=1&next=${encodeURIComponent(next)}&hint=no-password-env`);
  }
  if (!constantTimeEqual(password, process.env.AGENTFLOW_PASSWORD)) {
    record({ action: "auth.fail", entity: "session", payload: { reason: "legacy-password-mismatch" } });
    await sleep(1500);
    return redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  // Either find or fall back to admin@local (bootstrap creates it).
  const admin = usersRepo.getByEmail("admin@local");
  if (admin) {
    recordAttempt({ email: "admin@local", ip, ok: true });
    await setSessionWith(admin.id, ip, userAgent);
    usersRepo.touchLogin(admin.id);
    record({ action: "auth.login", entity: "session", entityId: admin.id, payload: { mode: "legacy", ip } });
    return redirect(next);
  }
  // Last-resort: no users yet, no admin row — issue a session with sub=0 so
  // middleware approves but no user record exists. This shouldn't happen in
  // practice because bootstrap runs eagerly, but it keeps the login UX honest
  // for ops who set AGENTFLOW_PASSWORD AFTER the first page load.
  await setSessionLegacyNoUser();
  record({ action: "auth.login", entity: "session", payload: { mode: "legacy-no-user" } });
  return redirect(next);
  void userCount;
}

async function submitTotp(formData: FormData) {
  "use server";
  await getDbReady();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const next = String(formData.get("next") ?? "/") || "/";
  const pending = cookies().get(PENDING_2FA_COOKIE)?.value;
  if (!pending) return redirect(`/login?error=1&hint=totp-expired&next=${encodeURIComponent(next)}`);

  // Verify pending token: we use the same signSession secret + sub field.
  const { verifySession } = await import("@/lib/auth");
  const verdict = await verifySession(pending);
  if (!verdict.ok) {
    cookies().set(PENDING_2FA_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
    return redirect(`/login?error=1&hint=totp-expired&next=${encodeURIComponent(next)}`);
  }
  const userId = decodeSubFromPendingToken(pending);
  if (!userId) {
    cookies().set(PENDING_2FA_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
    return redirect(`/login?error=1&hint=totp-expired&next=${encodeURIComponent(next)}`);
  }
  const user = usersRepo.get(userId);
  if (!user || !user.totp_enabled || !user.totp_secret) {
    cookies().set(PENDING_2FA_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
    return redirect(`/login?error=1&hint=totp-expired&next=${encodeURIComponent(next)}`);
  }

  const ip = ipFromHeaders(headers());
  const userAgent = headers().get("user-agent") ?? "";

  // TOTP rate limit (separate bucket from password): 5 tries per 5 min per user.
  const rl = consume({ route: "totp", key: String(userId), limit: 5, windowMs: 5 * 60 * 1000 });
  if (!rl.ok) {
    record({ action: "auth.fail", entity: "session", entityId: userId, payload: { reason: "totp-rate-limited", ip } });
    return redirect(`/login?error=1&hint=rate-limited&next=${encodeURIComponent(next)}`);
  }

  const ok = verifyTotp(fromBase32(user.totp_secret), code);
  if (!ok) {
    record({ action: "auth.fail", entity: "session", entityId: userId, payload: { reason: "bad-totp", ip } });
    recordAttempt({ email: user.email, ip, ok: false });
    return redirect(`/login?stage=totp&error=1&hint=bad-totp&next=${encodeURIComponent(next)}`);
  }

  recordAttempt({ email: user.email, ip, ok: true });
  cookies().set(PENDING_2FA_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  await setSessionWith(user.id, ip, userAgent);
  usersRepo.touchLogin(user.id);
  record({ action: "auth.login", entity: "session", entityId: user.id, payload: { email: user.email, ip, stage: "totp-ok" } });
  redirect(next);
}

function decodeSubFromPendingToken(token: string): number | null {
  const body = token.split(".")[0];
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const std = (body + pad).replace(/-/g, "+").replace(/_/g, "/");
    const obj = JSON.parse(atob(std)) as { sub?: number };
    return typeof obj.sub === "number" ? obj.sub : null;
  } catch {
    return null;
  }
}

async function setSessionWith(sub: number, ip: string, userAgent: string) {
  const sess = createSession({ userId: sub, ip, userAgent });
  const token = await signSession({ exp: expectedExp(), sub, sid: sess.jti });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

async function setSessionLegacyNoUser() {
  const token = await signSession({ exp: expectedExp() });
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

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string; hint?: string; stage?: string } }) {
  await getDbReady();
  const error = !!searchParams?.error;
  const next = searchParams?.next || "/";
  const hint = searchParams?.hint;
  const stage = searchParams?.stage === "totp" && cookies().get(PENDING_2FA_COOKIE) ? "totp" : "password";
  const isEmptyDB = usersRepo.count() === 0;
  const hasEnvPassword = !!process.env.AGENTFLOW_PASSWORD;
  // Surface role/user info to help operators understand the deployment state
  const builtinRoles = rolesRepo.list().filter((r) => r.is_system === 1);

  if (stage === "totp") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border border-forge-line bg-forge-panel/60 p-6 shadow-panel">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-500 font-bold text-forge">AF</div>
            <div>
              <div className="text-base font-semibold text-ink-50">两步验证</div>
              <div className="text-xs text-forge-muted">请输入 Authenticator 当前 6 位验证码</div>
            </div>
          </div>
          <form action={submitTotp} className="space-y-3">
            <input type="hidden" name="next" value={next} />
            <input
              autoFocus
              name="code"
              required
              pattern="\d{6}"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-center font-mono text-xl tracking-widest text-ink-50 outline-none focus:border-accent-500"
            />
            {error ? (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {hint === "bad-totp" ? "验证码错误，请再试。" : hint === "totp-expired" ? "会话已过期，请重新登录。" : "验证失败。"}
              </div>
            ) : null}
            <button type="submit" className="w-full rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              验证
            </button>
            <a href="/login" className="block text-center text-xs text-forge-muted hover:text-ink-200">放弃，重新登录</a>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-forge-line bg-forge-panel/60 p-6 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-500 font-bold text-forge">AF</div>
          <div>
            <div className="text-base font-semibold text-ink-50">AgentFlow</div>
            <div className="text-xs text-forge-muted">智造工坊 · v0.4</div>
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
                ? "服务器未配置 AGENTFLOW_PASSWORD，且账户不存在。"
                : hint === "rate-limited"
                ? "登录请求过于频繁，请 15 分钟后再试。"
                : hint === "locked-out"
                ? "账号已锁定（15 分钟内连续 5 次失败）。请稍后再试或联系管理员。"
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
              💡 兼容模式：留空邮箱并输入 <code className="text-accent-300">AGENTFLOW_PASSWORD</code> 也可登录（owner 身份）。
            </p>
          ) : (
            <p className="text-amber-300">
              ⚠️ 未设置 <code>AGENTFLOW_PASSWORD</code>，首次登录前请在 <code>.env.local</code> 中配置。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
