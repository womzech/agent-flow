"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateReportForm({ diagnosticId, hasReport }: { diagnosticId: number; hasReport: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(opts: { useFallback: boolean }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/diagnostics/${diagnosticId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ useFallback: opts.useFallback }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSubmit({ useFallback: false })}
          disabled={loading}
          className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400 disabled:opacity-50"
        >
          {loading ? "生成中..." : hasReport ? "重新生成 (Claude)" : "用 Claude 生成报告"}
        </button>
        <button
          onClick={() => onSubmit({ useFallback: true })}
          disabled={loading}
          className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60 disabled:opacity-50"
        >
          离线占位生成
        </button>
        <span className="text-xs text-forge-muted">
          离线模式：不调用 API，用本地模板生成（适合演示 / 没有 API key 时）。
        </span>
      </div>
      {error ? <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div> : null}
    </div>
  );
}
