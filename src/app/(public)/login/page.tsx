import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, constantTimeEqual, expectedExp, signSession } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const submitted = String(formData.get("password") ?? "");
  const expected = process.env.AGENTFORGE_PASSWORD;
  const next = String(formData.get("next") ?? "/") || "/";

  if (!expected) {
    // No password configured — open mode. Just redirect.
    redirect(next);
  }

  if (!constantTimeEqual(submitted, expected)) {
    // Intentional 1.5s delay to slow brute force without losing UX.
    await new Promise((r) => setTimeout(r, 1500));
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await signSession({ exp: expectedExp() });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
  redirect(next);
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  const error = !!searchParams?.error;
  const next = searchParams?.next || "/";
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-forge-line bg-forge-panel/60 p-6 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-500 font-bold text-forge">AF</div>
          <div>
            <div className="text-base font-semibold text-ink-50">AgentForge</div>
            <div className="text-xs text-forge-muted">智造工坊 · v0.2</div>
          </div>
        </div>
        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm text-ink-100">访问密码</span>
            <input
              autoFocus
              type="password"
              name="password"
              required
              className="mt-1 w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
              placeholder="••••••••"
            />
          </label>
          {error ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              密码错误。
            </div>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400"
          >
            登录
          </button>
        </form>
        <p className="mt-4 text-xs text-forge-muted">
          首次部署：在 <code className="text-accent-300">.env.local</code> 设置 <code className="text-accent-300">AGENTFORGE_PASSWORD</code> 启用鉴权。未设置时为开放模式（仅本地开发用）。
        </p>
      </div>
    </div>
  );
}
