"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";

const SAMPLE_CSV = `ticket_id,subject,category,priority,status,response_time_hours,resolution_time_hours,agent_id,customer_satisfaction
T001,无法登录账户,技术支持,高,已解决,2.5,8.0,agent_03,4
T002,退款申请,财务,中,待处理,24.0,,agent_01,
T003,产品功能咨询,产品反馈,低,已解决,1.2,3.5,agent_02,5`;

type Mode = "csv" | "file";

export default function NewDataImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("csv");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("upload.csv");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (f) setFilename(f.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? "";

      let res: Response;
      if (mode === "file") {
        if (!selectedFile) { setError("请选择文件"); setLoading(false); return; }
        const form = new FormData();
        form.append("file", selectedFile);
        res = await fetch("/api/data-imports", {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
          body: form,
        });
      } else {
        if (!csvText.trim()) { setError("请粘贴 CSV 数据"); setLoading(false); return; }
        res = await fetch("/api/data-imports", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ csv_text: csvText, filename }),
        });
      }

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
          上传 CSV 或 Excel 文件，系统将自动分析数据质量并推荐自动化方案
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

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-forge-line overflow-hidden w-fit">
        {(["csv", "file"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium transition ${
              mode === m
                ? "bg-accent-500 text-forge"
                : "bg-forge text-forge-muted hover:bg-forge-line/60"
            }`}
          >
            {m === "csv" ? "粘贴 CSV" : "上传文件（CSV / Excel）"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "csv" ? (
          <>
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
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>选择文件</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-forge-line px-6 py-10 text-sm text-forge-muted transition hover:border-accent-500 hover:text-accent-400"
              >
                <span className="text-2xl">↑</span>
                <span>点击选择 CSV 或 Excel 文件（.csv / .xlsx / .xls）</span>
              </button>
              {selectedFile && (
                <div className="rounded-md border border-forge-line bg-forge-line/20 px-4 py-3 text-sm">
                  <span className="font-medium text-ink-100">{selectedFile.name}</span>
                  <span className="ml-2 text-forge-muted">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
              <p className="text-xs text-forge-muted">
                支持 CSV（UTF-8）、Excel 2007+ (.xlsx) 和旧版 Excel (.xls)；最大 10 MB；仅读取第一个工作表
              </p>
            </div>
          </Card>
        )}

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
