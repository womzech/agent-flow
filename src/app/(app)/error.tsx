"use client";

import { useEffect } from "react";
import Link from "next/link";

interface HttpLikeError extends Error {
  digest?: string;
  status?: number;
  code?: string;
}

export default function AppError({ error, reset }: { error: HttpLikeError; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[AgentForge] route error:", error);
  }, [error]);

  // HttpError thrown from requireUser / requirePermission carries a code in
  // its message ("缺少权限 write:leads") or via `code` if Next preserves it.
  const message = error.message || "";
  const isForbidden = error.code === "auth/forbidden" || /缺少权限/.test(message);
  const isUnauthorized = error.code === "auth/required" || /请先登录/.test(message);

  if (isForbidden) {
    return (
      <Frame tone="warning" title="403 · 没有权限" subtitle="你的角色无法访问这个资源">
        <p className="text-sm text-forge-muted">{message}</p>
        <p className="mt-3 text-xs text-forge-muted">
          如果你认为这是配置错误，请联系 owner 在 <Link href="/users" className="text-accent-400 hover:underline">用户管理</Link> 调整角色或权限。
        </p>
        <div className="mt-4">
          <Link href="/" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            返回工作台
          </Link>
        </div>
      </Frame>
    );
  }

  if (isUnauthorized) {
    return (
      <Frame tone="warning" title="401 · 未登录" subtitle="会话已过期，请重新登录">
        <Link href="/login" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
          去登录
        </Link>
      </Frame>
    );
  }

  return (
    <Frame tone="danger" title="应用错误" subtitle="这个页面渲染出错了">
      <p className="text-sm text-forge-muted">{message || "未知错误"}</p>
      {error.digest ? <p className="mt-1 font-mono text-xs text-forge-muted">digest: {error.digest}</p> : null}
      <div className="mt-4 flex gap-2">
        <button onClick={reset} className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
          重试
        </button>
        <Link href="/" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
          回到工作台
        </Link>
      </div>
      <details className="mt-4 text-xs text-forge-muted">
        <summary className="cursor-pointer">调试信息</summary>
        <pre className="mt-2 overflow-auto rounded-md border border-forge-line/60 bg-forge p-2">{error.stack ?? error.toString()}</pre>
      </details>
    </Frame>
  );
}

function Frame({ tone, title, subtitle, children }: { tone: "warning" | "danger"; title: string; subtitle: string; children: React.ReactNode }) {
  const cls = tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-rose-500/30 bg-rose-500/5";
  const tag = tone === "warning" ? "text-amber-300" : "text-rose-300";
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className={`max-w-lg rounded-lg border ${cls} p-6`}>
        <div className={`mb-2 text-xs uppercase tracking-wider ${tag}`}>{subtitle}</div>
        <h1 className="text-lg font-semibold text-ink-50">{title}</h1>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}
