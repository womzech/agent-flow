import { NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { diagnosticsRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const d = diagnosticsRepo.get(id);
  if (!d) return NextResponse.json({ error: "not found", code: "not-found" }, { status: 404 });
  const payload = {
    id: d.id,
    title: d.title,
    status: d.status,
    questionnaire: diagnosticsRepo.parseQuestionnaire(d),
    report_markdown: d.report_markdown,
    pricing_quote_yuan: d.pricing_quote_cents / 100,
    monthly_quote_yuan: d.monthly_quote_cents / 100,
    recommended_templates: diagnosticsRepo.recommendedTemplates(d),
    generated_at: d.generated_at,
    model_used: d.model_used,
    created_at: d.created_at,
  };
  record({ action: "export.json", entity: "diagnostic", entityId: id });
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="diagnostic-${id}.json"`,
    },
  });
}
