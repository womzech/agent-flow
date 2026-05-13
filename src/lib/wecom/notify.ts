/**
 * Outbound event notifications: AgentFlow → WeCom.
 *
 * Designed to be called from server actions and API routes immediately after
 * the corresponding audit `record()` call. Failures NEVER throw — they get
 * logged via audit `wecom.fail`. WeCom misconfiguration / temporarily down
 * APIs must not break the main user flow.
 */

import { record } from "../audit";
import { fmtCents, fmtDate } from "../utils";
import { defaultRecipients, isConfigured, sendMarkdown } from "./api";

export type NotifyEvent =
  | { kind: "lead.create"; lead: { id: number; company: string; name: string; industry: string; pain_points: string; source: string }; actor?: string }
  | { kind: "diagnostic.generate"; diagnostic: { id: number; title: string; pricing_quote_cents: number; monthly_quote_cents: number; share_token: string | null }; actor?: string }
  | { kind: "deliverable.bundle"; deliverable: { id: number; project_id: number; template_slug: string; bundle_size_bytes: number | null }; client?: string; project?: string; actor?: string }
  | { kind: "revenue.add"; revenue: { id: number; kind: string; amount_cents: number; memo: string }; client?: string; project?: string; actor?: string };

function render(event: NotifyEvent): { title: string; body: string } {
  switch (event.kind) {
    case "lead.create": {
      const l = event.lead;
      return {
        title: "🆕 新线索",
        body: [
          `**新线索**：${l.company}（${l.industry || "—"}）`,
          `- 联系人：${l.name}`,
          `- 渠道：${l.source}`,
          `- 痛点：${(l.pain_points || "（未填写）").slice(0, 120)}`,
          event.actor ? `\n_录入：${event.actor}_` : "",
        ].filter(Boolean).join("\n"),
      };
    }
    case "diagnostic.generate": {
      const d = event.diagnostic;
      return {
        title: "📄 诊断生成",
        body: [
          `**诊断报告已生成**：${d.title}`,
          `- 推荐项目费：${fmtCents(d.pricing_quote_cents)}`,
          `- 月度维护费：${fmtCents(d.monthly_quote_cents)}`,
          d.share_token ? `- 分享链接：见 Web 端 /diagnostics/${d.id}` : "",
          event.actor ? `\n_生成：${event.actor}_` : "",
        ].filter(Boolean).join("\n"),
      };
    }
    case "deliverable.bundle": {
      const d = event.deliverable;
      return {
        title: "📦 交付包打好",
        body: [
          `**交付物已打包**`,
          `- 项目：${event.project ?? `#${d.project_id}`}`,
          `- 客户：${event.client ?? "—"}`,
          `- 模板：${d.template_slug}`,
          d.bundle_size_bytes ? `- 大小：${Math.round(d.bundle_size_bytes / 1024)} KB` : "",
          event.actor ? `\n_打包：${event.actor}_` : "",
        ].filter(Boolean).join("\n"),
      };
    }
    case "revenue.add": {
      const r = event.revenue;
      return {
        title: "💰 入账",
        body: [
          `**收入入账**：${fmtCents(r.amount_cents)}（${r.kind}）`,
          event.client ? `- 客户：${event.client}` : "",
          event.project ? `- 项目：${event.project}` : "",
          r.memo ? `- 备注：${r.memo}` : "",
          `- 入账时间：${fmtDate(new Date().toISOString())}`,
          event.actor ? `\n_记账：${event.actor}_` : "",
        ].filter(Boolean).join("\n"),
      };
    }
  }
}

/**
 * Fire-and-forget. Returns a Promise but server actions can ignore it.
 * Tests can await the returned Promise to assert the audit row.
 */
export async function notifyEvent(event: NotifyEvent, override?: { touser?: string; toparty?: string; totag?: string }): Promise<void> {
  if (!isConfigured()) return; // graceful no-op
  const recipients = override ?? defaultRecipients();
  const { title, body } = render(event);
  try {
    const r = await sendMarkdown(recipients, body);
    if (!r.ok) {
      record({ action: "wecom.fail", entity: "wecom", payload: { stage: "notify", event: event.kind, errmsg: r.errmsg } });
    } else {
      record({ action: "wecom.push", entity: "wecom", payload: { event: event.kind, title, to: recipients } });
    }
  } catch (err) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "notify", event: event.kind, reason: (err as Error).message } });
  }
}

/** Synchronously kick off a notification without awaiting; suitable for hot paths. */
export function notifyEventAsync(event: NotifyEvent, override?: { touser?: string; toparty?: string; totag?: string }): void {
  if (!isConfigured()) return;
  void notifyEvent(event, override);
}
