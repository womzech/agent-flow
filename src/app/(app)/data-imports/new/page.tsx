"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";

const SAMPLE_CSV = `ticket_id,subject,category,priority,status,response_time_hours,resolution_time_hours,agent_id,customer_satisfaction
T001,无法登录账户,技术支持,高,已解决,2.5,8.0,agent_03,4
T002,退款申请,财务,中,待处理,24.0,,agent_01,
T003,产品功能咨询,产品反馈,低,已解决,1.2,3.5,agent_02,5`;

export default function NewDataImportPage() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("upload.csv");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) { setError("请粘贴 CSV 数据"); return; }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/data-imports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "",
        },
        body: JSON.stringify({ csv_text: csvText, filename }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "上传失败");
        return;
      }
      const imp = await res.json() as { id: number };
      router.push(`/data-imports/${imp.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-ink-50">导入业务数据</h1>
        <p className="mt-1 text-sm text-forge-muted">
          粘贴 CSV 内容，系统将自动分析数据质量并推荐自动化方案
        </p>
      </div>

      {/* Stage indicator */}
      <div className="flex items-center gap-2 text-xs text-forge-muted">
        {["数据导入", "诊断", "方案", "报价/SOW", "客户确认", "验收"].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            {i > 0 && <span>›</span>}
            <span className={i === 0 ? "font-semibold text-accent-300" : ""}>{s}</span>
          </span>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>文件名称</CardTitle>
          </CardHeader>
          <input
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="upload.csv"
            className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-100 placeholder:text-forge-muted focus:border-accent-500 focus:outline-none"
          />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CSV 数据</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"粘贴 CSV 内容（含表头行）...\n\n" + SAMPLE_CSV}
              rows={14}
              className="w-full rounded-md border border-forge-line bg-forge px-3 py-2 font-mono text-xs text-ink-100 placeholder:text-forge-muted focus:border-accent-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setCsvText(SAMPLE_CSV + "\nT004,账单错误,财务,高,处理中,6.0,,agent_04,\nT005,无法登录账户,,高,已解决,3.0,6.0,agent_03,3\nT006,配送延误,物流,中,已解决,12.0,24.0,agent_05,2\nT007,退款申请,财务,高,待处理,48.0,,agent_01,\nT008,App闪退,技术支持,高,已解决,1.0,2.0,agent_02,5\nT009,产品质量问题,产品反馈,高,处理中,8.0,,agent_06,\nT010,积分兑换问题,,中,待处理,16.0,,agent_04,")}
              className="text-xs text-accent-400 hover:text-accent-300 underline"
            >
              载入演示数据（客服工单场景）
            </button>
          </div>
        </Card>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={loading}>
            {loading ? "分析中..." : "解析并分析质量"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            取消
          </Button>
        </div>
      </form>
    </div>
  );
}
