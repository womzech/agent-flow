"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-•·]\s*/, "").trim())
    .filter(Boolean);
}

export default function CreateAcceptanceForm({
  projectId,
  packages,
}: {
  projectId: number;
  packages: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [packageId, setPackageId] = useState<string>(packages[0]?.id?.toString() ?? "");
  const [features, setFeatures] = useState("AI 工单自动分类（准确率 ≥ 85%）\n智能路由规则部署\nSLA 超时自动告警\n操作手册与培训");
  const [limitations, setLimitations] = useState("首批分类模型需约 500 条标注数据微调\n仅支持中文工单，暂不支持英文混合输入");
  const [excluded, setExcluded] = useState("客服系统 UI 改造\n第三方平台账号费用");
  const [signoff, setSignoff] = useState<"pending" | "signed">("signed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/acceptance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "",
        },
        body: JSON.stringify({
          project_id: projectId,
          solution_package_id: packageId ? Number(packageId) : null,
          accepted_features: parseLines(features),
          known_limitations: parseLines(limitations),
          excluded_items: parseLines(excluded),
          evidence_links: [],
          signoff_status: signoff,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "提交失败");
        return;
      }
      router.refresh();
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {packages.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-forge-muted mb-1">关联方案包</label>
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
          >
            <option value="">不关联</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-forge-muted mb-1">已验收功能（每行一项）</label>
        <textarea
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-forge-muted mb-1">已知限制（每行一项）</label>
        <textarea
          value={limitations}
          onChange={(e) => setLimitations(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-forge-muted mb-1">不含事项（每行一项）</label>
        <textarea
          value={excluded}
          onChange={(e) => setExcluded(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-forge-muted mb-1">签署状态</label>
        <select
          value={signoff}
          onChange={(e) => setSignoff(e.target.value as "pending" | "signed")}
          className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 focus:border-accent-500 focus:outline-none"
        >
          <option value="pending">待签署</option>
          <option value="signed">已签署</option>
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "提交中..." : "创建验收记录"}
      </Button>
    </form>
  );
}
