import { record } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { clientsRepo, projectsRepo, revenueRepo } from "@/lib/repo";
import { REVENUE_KIND_LABELS } from "@/lib/schema";

export async function GET() {
  const clients = new Map(clientsRepo.list().map((c) => [c.id, c.company]));
  const projects = new Map(projectsRepo.list().map((p) => [p.id, p.name]));
  const rows = revenueRepo.list().map((r) => ({
    id: r.id,
    kind: REVENUE_KIND_LABELS[r.kind],
    amount_yuan: r.amount_cents / 100,
    client: r.client_id ? clients.get(r.client_id) ?? "" : "",
    project: r.project_id ? projects.get(r.project_id) ?? "" : "",
    paid_at: r.paid_at,
    memo: r.memo,
  }));
  record({ action: "export.csv", entity: "revenue", payload: { rows: rows.length } });
  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="revenue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
