import { notFound } from "next/navigation";
import { diagnosticsRepo, isTokenExpired } from "@/lib/repo";
import { fmtCents, fmtDate, renderMarkdown } from "@/lib/utils";
import { ComplianceFooter } from "@/components/layout/compliance-footer";

export const dynamic = "force-dynamic";

export default function SharedDiagnosticPage({ params }: { params: { token: string } }) {
  const d = diagnosticsRepo.getByShareToken(params.token);
  if (!d || !d.report_markdown) notFound();
  if (d.token_revoked_at || isTokenExpired(d.token_expires_at)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-xl font-semibold text-ink-50">链接已失效</h1>
        <p className="text-sm text-forge-muted">
          此分享链接已 {d.token_revoked_at ? "被撤回" : "过期"}。请联系您的顾问获取新链接。
        </p>
      </div>
    );
  }
  diagnosticsRepo.recordShareView(params.token);
  if (d.status === "ready") diagnosticsRepo.update(d.id, { status: "shared" });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-2 flex items-center justify-between text-xs text-forge-muted">
        <span>由 AgentFlow / 智造工坊 出具</span>
        <span>
          生成于 {fmtDate(d.generated_at)} ·{" "}
          <a href={`/share/${params.token}/print`} className="text-accent-400 hover:underline">
            打印 / PDF 版 →
          </a>
        </span>
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-ink-50">{d.title}</h1>
      <div className="mb-8 grid grid-cols-2 gap-3 rounded-lg border border-forge-line bg-forge-panel/60 p-4">
        <div>
          <div className="text-xs text-forge-muted">推荐试点项目费</div>
          <div className="text-xl font-semibold text-ink-50">{fmtCents(d.pricing_quote_cents)}</div>
        </div>
        <div>
          <div className="text-xs text-forge-muted">推荐月度维护费</div>
          <div className="text-xl font-semibold text-ink-50">{fmtCents(d.monthly_quote_cents)}</div>
        </div>
      </div>
      <article
        className="prose-forge rounded-lg border border-forge-line bg-forge-panel/60 p-6"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(d.report_markdown) }}
      />
      <div className="mt-10 border-t border-forge-line pt-6 text-center text-xs text-forge-muted">
        本报告仅供决策参考。最终方案以双方签署的服务合同为准。
      </div>
      <ComplianceFooter className="mt-4" />
    </div>
  );
}
