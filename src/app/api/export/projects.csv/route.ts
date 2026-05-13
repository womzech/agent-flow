import { record } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { clientsRepo, projectsRepo } from "@/lib/repo";
import { PROJECT_STATUS_LABELS } from "@/lib/schema";

export async function GET() {
  const clients = clientsRepo.list();
  const byClient = new Map(clients.map((c) => [c.id, c]));
  const rows = projectsRepo.list().map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client_id ? byClient.get(p.client_id)?.company ?? "" : "",
    status: PROJECT_STATUS_LABELS[p.status],
    project_fee_yuan: p.project_fee_cents / 100,
    monthly_fee_yuan: p.monthly_fee_cents / 100,
    started_at: p.started_at,
    handed_over_at: p.handed_over_at ?? "",
    notes: p.notes,
  }));
  record({ action: "export.csv", entity: "project", payload: { rows: rows.length } });
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="projects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
