import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Pill, Section } from "@/components/ui";
import { record } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { usersRepo } from "@/lib/repo";
import { fromBase32, generateSecret, otpauthUri, verify as verifyTotp } from "@/lib/totp";

export const dynamic = "force-dynamic";

interface PendingSecret { secretB32: string; setupUri: string }

/**
 * v0.4 takes a pragmatic shortcut: the pending TOTP secret is stored in the
 * users.totp_secret column even before the user proves possession. We use
 * `totp_enabled = 0` to mean "pending, not yet verified" and `1` to mean
 * "fully enrolled".
 *
 * Implication: a partial enrollment never lets a user log in with a code —
 * the login flow checks `totp_enabled === 1`. Worst case (admin sees the
 * secret) is identical to bootstrap, where the operator already trusts
 * filesystem access.
 */

async function startEnroll() {
  "use server";
  const me = await requireUser();
  if (me.user.totp_enabled) return redirect("/security/2fa");
  const s = generateSecret();
  usersRepo.update(me.user.id, { totp_secret: s.base32 });
  record({ actor: me.user.email, action: "user.update", entity: "user", entityId: me.user.id, payload: { totp_pending: true } });
  redirect("/security/2fa");
}

async function confirmEnroll(formData: FormData) {
  "use server";
  const me = await requireUser();
  if (me.user.totp_enabled) return redirect("/security/2fa");
  if (!me.user.totp_secret) return redirect("/security/2fa?error=no-pending");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const ok = verifyTotp(fromBase32(me.user.totp_secret), code);
  if (!ok) return redirect("/security/2fa?error=bad-code");
  usersRepo.update(me.user.id, { totp_enabled: 1 });
  record({ actor: me.user.email, action: "user.update", entity: "user", entityId: me.user.id, payload: { totp_enabled: true } });
  redirect("/security/2fa?ok=enabled");
}

async function disable2fa(formData: FormData) {
  "use server";
  const me = await requireUser();
  if (!me.user.totp_enabled || !me.user.totp_secret) return redirect("/security/2fa");
  // Demand a fresh code to prevent CSRF-style remote disable: only the
  // device holding the seed can confirm.
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const ok = verifyTotp(fromBase32(me.user.totp_secret), code);
  if (!ok) return redirect("/security/2fa?error=bad-code");
  usersRepo.update(me.user.id, { totp_secret: null, totp_enabled: 0 });
  record({ actor: me.user.email, action: "user.update", entity: "user", entityId: me.user.id, payload: { totp_disabled: true } });
  redirect("/security/2fa?ok=disabled");
}

export default async function TwoFaPage({ searchParams }: { searchParams: { error?: string; ok?: string } }) {
  const me = await requireUser();
  const u = me.user;
  const pending: PendingSecret | null = u.totp_secret && !u.totp_enabled
    ? { secretB32: u.totp_secret, setupUri: otpauthUri({ email: u.email, secretBase32: u.totp_secret }) }
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="两步验证 (2FA)"
        description={u.totp_enabled ? "你的账号已启用基于时间的一次性密码 (TOTP)。" : "尚未启用 — 强烈建议 owner / consultant 启用。"}
        action={<Link href="/security" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">← 安全总览</Link>}
      />

      {searchParams.ok === "enabled" ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          ✅ 已启用。下次登录会提示输入 6 位验证码。
        </div>
      ) : null}
      {searchParams.ok === "disabled" ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          已禁用 2FA。请考虑在再次外出 / 共用设备前重新启用。
        </div>
      ) : null}
      {searchParams.error === "bad-code" ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          验证码错误。注意 6 位数字、±30 秒窗口内有效。
        </div>
      ) : null}

      <Section title="当前状态">
        <Card>
          <div className="flex items-center gap-3">
            {u.totp_enabled ? <Pill tone="success">已启用</Pill> : pending ? <Pill tone="warning">待确认</Pill> : <Pill tone="danger">未启用</Pill>}
            <span className="text-sm text-forge-muted">
              算法 HMAC-SHA1 · 30 秒窗口 · 6 位数字（RFC 6238 标准）
            </span>
          </div>
        </Card>
      </Section>

      {!u.totp_enabled && !pending ? (
        <Section title="启用 2FA">
          <Card>
            <form action={startEnroll}>
              <p className="mb-3 text-sm text-ink-200">
                点击下面的按钮后，AgentFlow 会生成一个 20 字节随机 secret。请用 Google Authenticator / Microsoft Authenticator / 1Password / Bitwarden 等 TOTP 客户端扫描或粘贴 URI 完成绑定。
              </p>
              <button type="submit" className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400">
                生成 secret 并开始
              </button>
            </form>
          </Card>
        </Section>
      ) : null}

      {pending ? (
        <>
          <Section title="第 1 步：在 Authenticator 中添加">
            <Card>
              <p className="mb-2 text-sm text-ink-200">复制下方 base32 secret 到你的 Authenticator 应用，或把 otpauth URI 转 QR：</p>
              <div className="rounded-md border border-forge-line bg-forge p-3">
                <div className="text-xs uppercase tracking-wider text-forge-muted">Base32 Secret</div>
                <pre className="overflow-x-auto break-all font-mono text-sm text-accent-300">{pending.secretB32}</pre>
              </div>
              <div className="mt-3 rounded-md border border-forge-line bg-forge p-3">
                <div className="text-xs uppercase tracking-wider text-forge-muted">otpauth URI</div>
                <pre className="overflow-x-auto break-all text-xs text-accent-300">{pending.setupUri}</pre>
                <p className="mt-2 text-xs text-forge-muted">
                  无内置 QR 码图（不引入新依赖）。可用任意 QR 在线生成器或在 Authenticator 中粘贴 URI。
                </p>
              </div>
            </Card>
          </Section>
          <Section title="第 2 步：输入当前 6 位验证码">
            <Card>
              <form action={confirmEnroll} className="flex gap-2">
                <input
                  name="code"
                  required
                  pattern="\d{6}"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-40 rounded-md border border-forge-line bg-forge px-3 py-2 text-center font-mono text-lg tracking-widest text-ink-50 outline-none focus:border-accent-500"
                />
                <button type="submit" className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400">
                  确认启用
                </button>
              </form>
              <p className="mt-2 text-xs text-forge-muted">
                如果输错或超时，输入下一个验证码即可重试。AgentFlow 接受当前 30 秒窗口前后各 1 个 token（±60 秒容忍时钟漂移）。
              </p>
            </Card>
          </Section>
        </>
      ) : null}

      {u.totp_enabled ? (
        <Section title="禁用 2FA" description="需要提供一个有效验证码，确保只有持有种子的设备能关闭。">
          <Card>
            <form action={disable2fa} className="flex gap-2">
              <input
                name="code"
                required
                pattern="\d{6}"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-40 rounded-md border border-forge-line bg-forge px-3 py-2 text-center font-mono text-lg tracking-widest text-ink-50 outline-none focus:border-accent-500"
              />
              <button type="submit" className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/20">
                确认禁用
              </button>
            </form>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}
