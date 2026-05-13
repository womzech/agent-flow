import { notFound } from "next/navigation";
import { PrintButton } from "@/components/share/print-button";
import { diagnosticsRepo, settingsRepo } from "@/lib/repo";
import { fmtCents, fmtDate, renderMarkdown } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function PrintDiagnosticPage({ params }: { params: { token: string } }) {
  const d = diagnosticsRepo.getByShareToken(params.token);
  if (!d || !d.report_markdown) notFound();

  const settings = settingsRepo.all();
  const consultantName = settings.consultant_name || process.env.AGENTFORGE_CONSULTANT_NAME || "AI 工作流顾问";
  const consultantTitle = settings.consultant_title || process.env.AGENTFORGE_CONSULTANT_TITLE || "AI 工作流顾问";
  const consultantPhone = settings.consultant_phone || process.env.AGENTFORGE_CONSULTANT_PHONE || "";
  const consultantEmail = settings.consultant_email || process.env.AGENTFORGE_CONSULTANT_EMAIL || "";

  return (
    <div className="print-doc">
      <style>{`
        @media print {
          html, body { background: #fff !important; color: #111 !important; }
          .print-doc { color: #111; background: #fff; }
          .print-toolbar { display: none !important; }
          .pagebreak { page-break-before: always; }
        }
        @page { margin: 18mm 14mm; }
        body { background: #fff; color: #111; }
        .print-doc { max-width: 760px; margin: 0 auto; padding: 28px 32px; background: #fff; color: #111; font-family: ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.65; }
        .print-doc h1, .print-doc h2, .print-doc h3 { color: #111; font-weight: 600; margin: 1.4em 0 0.6em; }
        .print-doc h1 { font-size: 26px; border-bottom: 2px solid #111; padding-bottom: 8px; }
        .print-doc h2 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .print-doc h3 { font-size: 15px; }
        .print-doc p, .print-doc li { color: #333; }
        .print-doc table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .print-doc th, .print-doc td { border: 1px solid #aaa; padding: 6px 10px; }
        .print-doc th { background: #f3f3f3; }
        .print-doc code { background: #f3f3f3; padding: 1px 4px; border-radius: 3px; font-size: 90%; }
        .print-doc blockquote { border-left: 3px solid #f97316; margin: 10px 0; padding-left: 10px; color: #555; }
        .print-doc strong { color: #111; }
        .print-doc .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .print-doc .header .brand { font-weight: 700; font-size: 13px; color: #555; letter-spacing: 0.05em; }
        .print-doc .header .meta { text-align: right; font-size: 11px; color: #777; }
        .print-doc .quote-card { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; border: 1px solid #d0d0d0; border-radius: 6px; padding: 14px 18px; margin: 16px 0; background: #fafafa; }
        .print-doc .signature { margin-top: 36px; padding-top: 16px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 12px; color: #444; }
        .print-toolbar { position: sticky; top: 0; padding: 8px 14px; background: #f5f7fa; color: #333; border-bottom: 1px solid #ddd; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
        .print-toolbar button { background: #f97316; color: #fff; border: 0; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
      `}</style>
      <div className="print-toolbar">
        <span>本页是 A4 打印 / 另存为 PDF 友好版。客户可以直接打印或转 PDF 归档。</span>
        <PrintButton />
      </div>
      <div className="header">
        <div>
          <div className="brand">AgentForge · 智造工坊</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{d.title}</div>
        </div>
        <div className="meta">
          <div>报告编号：{d.id}-{d.share_token?.slice(0, 8)}</div>
          <div>生成时间：{fmtDate(d.generated_at)}</div>
          <div>状态：{d.status}</div>
        </div>
      </div>

      <div className="quote-card">
        <div>
          <div style={{ fontSize: 11, color: "#666" }}>推荐试点项目费</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtCents(d.pricing_quote_cents)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#666" }}>推荐月度维护费</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtCents(d.monthly_quote_cents)}</div>
        </div>
      </div>

      <article dangerouslySetInnerHTML={{ __html: renderMarkdown(d.report_markdown) }} />

      <div className="signature">
        <div>
          <div style={{ fontWeight: 600, color: "#222" }}>{consultantName}</div>
          <div>{consultantTitle}</div>
          {consultantPhone ? <div>电话：{consultantPhone}</div> : null}
          {consultantEmail ? <div>邮箱：{consultantEmail}</div> : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>本报告仅供决策参考。</div>
          <div>最终方案以双方签署的服务合同为准。</div>
          <div>{new Date().toISOString().slice(0, 10)}</div>
        </div>
      </div>
    </div>
  );
}
