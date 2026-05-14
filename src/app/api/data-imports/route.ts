import { NextRequest, NextResponse } from "next/server";
import { parseCSV, analyzeQuality } from "@/lib/data-import";
import { businessDataImportsRepo } from "@/lib/delivery-os";
import { record } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  let body: {
    csv_text?: string;
    filename?: string;
    project_id?: number | null;
    client_id?: number | null;
    source_type?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const csvText = (body.csv_text ?? "").trim();
  if (!csvText) return NextResponse.json({ error: "csv_text is required" }, { status: 400 });

  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const summary = analyzeQuality(headers, rows);
  const imp = businessDataImportsRepo.create({
    project_id: body.project_id ?? null,
    client_id: body.client_id ?? null,
    source_type: body.source_type ?? "csv",
    filename: body.filename || "upload.csv",
    original_columns: headers,
    inferred_schema: summary.columns,
    row_count: rows.length,
    sample_rows: rows,
    data_quality_summary: summary,
  });

  const actor = req.headers.get("x-agentflow-user-id") || "consultant";
  record({
    actor,
    action: "import.create",
    entity: "business_data_imports",
    entityId: imp.id,
    payload: { filename: imp.filename, row_count: imp.row_count, project_id: imp.project_id },
  });

  return NextResponse.json(imp, { status: 201 });
}
