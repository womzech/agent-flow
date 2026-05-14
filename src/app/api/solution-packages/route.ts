import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/csrf";
import { businessDataImportsRepo, solutionPackagesRepo, generateSolutionPackageFromImport } from "@/lib/delivery-os";
import { record } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  let body: { data_import_id?: number; project_id?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.data_import_id) {
    return NextResponse.json({ error: "data_import_id is required" }, { status: 400 });
  }

  const imp = businessDataImportsRepo.get(body.data_import_id);
  if (!imp) return NextResponse.json({ error: "data import not found" }, { status: 404 });

  const input = generateSolutionPackageFromImport(imp, body.project_id ?? imp.project_id);
  const pkg = solutionPackagesRepo.create(input);

  const actor = req.headers.get("x-agentflow-user-id") || "consultant";
  record({
    actor,
    action: "package.create",
    entity: "solution_packages",
    entityId: pkg.id,
    payload: { data_import_id: imp.id, project_id: pkg.project_id, template_slug: pkg.template_slug },
  });

  return NextResponse.json(pkg, { status: 201 });
}
