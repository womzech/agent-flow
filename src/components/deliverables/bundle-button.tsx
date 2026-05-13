"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfHeaders } from "@/lib/csrf-client";

export function BundleButton({
  deliverableId,
  projectId,
  hasBundle,
}: {
  deliverableId: number;
  projectId: number;
  hasBundle: boolean;
}) {
  void projectId;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bundle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deliverables/${deliverableId}/bundle`, {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "same-origin",
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
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          onClick={bundle}
          disabled={loading}
          className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400 disabled:opacity-50"
        >
          {loading ? "打包中..." : hasBundle ? "重新打包" : "立即打包"}
        </button>
        {hasBundle ? (
          <a
            href={`/api/deliverables/${deliverableId}/download`}
            className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm text-ink-100 hover:bg-forge-line/60"
          >
            ⬇ 下载 zip
          </a>
        ) : null}
      </div>
      {error ? <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">{error}</div> : null}
    </div>
  );
}
