"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[AgentForge] route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-rose-500/30 bg-rose-500/5 p-6">
        <div className="mb-2 text-xs uppercase tracking-wider text-rose-300">应用错误</div>
        <h1 className="text-lg font-semibold text-ink-50">这个页面渲染出错了</h1>
        <p className="mt-2 text-sm text-forge-muted">{error.message || "未知错误"}</p>
        {error.digest ? <p className="mt-1 font-mono text-xs text-forge-muted">digest: {error.digest}</p> : null}
        <div className="mt-4 flex gap-2">
          <button
            onClick={reset}
            className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400"
          >
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
      </div>
    </div>
  );
}
