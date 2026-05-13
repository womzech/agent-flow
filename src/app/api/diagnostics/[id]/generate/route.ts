import { NextRequest, NextResponse } from "next/server";
import { diagnosticsRepo } from "@/lib/repo";
import { DEFAULT_MODEL, fallbackDiagnostic, generateDiagnostic, type DiagnosticQuestionnaire } from "@/lib/anthropic";
import { record } from "@/lib/audit";
import { applyHeaders, consume, ipFromHeaders } from "@/lib/ratelimit";
import { notifyEventAsync } from "@/lib/wecom/notify";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const d = diagnosticsRepo.get(id);
  if (!d) return NextResponse.json({ error: "diagnostic not found" }, { status: 404 });

  // Cap LLM spend: 10 generations / hour per session/IP.
  const userId = req.headers.get("x-agentforge-user-id") || ipFromHeaders(req.headers);
  const rl = consume({ route: "ai-generate", key: userId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    const res = NextResponse.json(
      { error: "rate limited", code: "ratelimit/exceeded", retry_after_sec: rl.retryAfterSec },
      { status: 429 },
    );
    applyHeaders(res.headers, rl, 10);
    return res;
  }

  let useFallback = !process.env.ANTHROPIC_API_KEY;
  try {
    const body = (await req.json()) as { useFallback?: boolean };
    if (body?.useFallback) useFallback = true;
  } catch { /* body optional */ }

  const q = diagnosticsRepo.parseQuestionnaire(d) as unknown as DiagnosticQuestionnaire;

  diagnosticsRepo.update(id, { status: "generating" });

  try {
    const result = useFallback ? fallbackDiagnostic(q) : await generateDiagnostic(q);
    diagnosticsRepo.update(id, {
      report_markdown: result.reportMarkdown,
      recommended_templates: result.recommendedTemplates,
      pricing_quote_cents: result.pricingQuoteCents || d.pricing_quote_cents,
      monthly_quote_cents: result.monthlyQuoteCents || d.monthly_quote_cents,
      status: "ready",
      generated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      model_used: result.modelUsed,
    });
    diagnosticsRepo.ensureShareToken(id);
    record({
      action: "diagnostic.generate",
      entity: "diagnostic",
      entityId: id,
      payload: { model: result.modelUsed, fallback: useFallback, templates: result.recommendedTemplates },
    });
    const refreshed = diagnosticsRepo.get(id);
    if (refreshed) {
      notifyEventAsync({
        kind: "diagnostic.generate",
        diagnostic: {
          id: refreshed.id,
          title: refreshed.title,
          pricing_quote_cents: refreshed.pricing_quote_cents,
          monthly_quote_cents: refreshed.monthly_quote_cents,
          share_token: refreshed.share_token,
        },
      });
    }
    return NextResponse.json({ ok: true, modelUsed: result.modelUsed, fallbackUsed: useFallback, defaultModel: DEFAULT_MODEL });
  } catch (err) {
    diagnosticsRepo.update(id, { status: "draft" });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
