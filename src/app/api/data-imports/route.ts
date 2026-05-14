import { NextRequest, NextResponse } from "next/server";
import { parseCSV, parseExcel, analyzeQuality } from "@/lib/data-import";
import { businessDataImportsRepo } from "@/lib/delivery-os";
import { record } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  let parsed: { headers: string[]; rows: Record<string, string>[] };
  let filename = "upload.csv";
  let projectId: number | null = null;
  let clientId: number | null = null;
  let sourceType = "csv";

  if (contentType.includes("multipart/form-data")) {
    // Excel or CSV file upload
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
    filename = file.name || "upload";
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "xlsx" || ext === "xls") {
      sourceType = "excel";
      parsed = parseExcel(buffer);
    } else {
      sourceType = "csv";
      parsed = parseCSV(buffer.toString("utf-8"));
    }
    const pid = form.get("project_id");
    if (pid) projectId = Number(pid);
    const cid = form.get("client_id");
    if (cid) clientId = Number(cid);
  } else {
    // JSON body with csv_text
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
    parsed = parseCSV(csvText);
    filename = body.filename || "upload.csv";
    projectId = body.project_id ?? null;
    clientId = body.client_id ?? null;
    sourceType = body.source_type ?? "csv";
  }

  const { headers, rows } = parsed;
  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const summary = analyzeQuality(headers, rows);
  const imp = businessDataImportsRepo.create({
    project_id: projectId,
    client_id: clientId,
    source_type: sourceType,
    filename,
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
