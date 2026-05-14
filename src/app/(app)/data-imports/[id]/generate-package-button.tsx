"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function GeneratePackageButton({
  dataImportId,
  projectId,
}: {
  dataImportId: number;
  projectId: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/solution-packages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "",
        },
        body: JSON.stringify({ data_import_id: dataImportId, project_id: projectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "生成失败");
        return;
      }
      const pkg = await res.json() as { id: number };
      router.push(`/solution-packages/${pkg.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={loading}>
        {loading ? "生成中..." : "生成方案包 →"}
      </Button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}
