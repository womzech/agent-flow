import { record } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { leadsRepo } from "@/lib/repo";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/schema";

export async function GET() {
  const leads = leadsRepo.list();
  const rows = leads.map((l) => ({
    id: l.id,
    company: l.company,
    name: l.name,
    industry: l.industry,
    contact: l.contact,
    stage: LEAD_STAGE_LABELS[l.stage],
    source: LEAD_SOURCE_LABELS[l.source] ?? l.source,
    pain_points: l.pain_points,
    budget_note: l.budget_note,
    next_action: l.next_action,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }));
  const csv = toCsv(rows);
  record({ action: "export.csv", entity: "lead", payload: { rows: rows.length } });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
