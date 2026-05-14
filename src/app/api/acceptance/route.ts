import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/csrf";
import { acceptanceRecordsRepo, solutionPackagesRepo } from "@/lib/delivery-os";
import { record } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  let body: {
    project_id?: number | null;
    solution_package_id?: number | null;
    accepted_features?: string[];
    known_limitations?: string[];
    excluded_items?: string[];
    evidence_links?: string[];
    signoff_status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.project_id && !body.solution_package_id) {
    return NextResponse.json({ error: "project_id or solution_package_id is required" }, { status: 400 });
  }

  let project_id = body.project_id ?? null;
  if (!project_id && body.solution_package_id) {
    const pkg = solutionPackagesRepo.get(body.solution_package_id);
    project_id = pkg?.project_id ?? null;
  }

  const ar = acceptanceRecordsRepo.create({
    project_id,
    solution_package_id: body.solution_package_id ?? null,
    accepted_features: body.accepted_features ?? [],
    known_limitations: body.known_limitations ?? [],
    excluded_items: body.excluded_items ?? [],
    evidence_links: body.evidence_links ?? [],
    signoff_status: body.signoff_status ?? "pending",
  });

  const actor = req.headers.get("x-agentflow-user-id") || "consultant";
  record({
    actor,
    action: "acceptance.create",
    entity: "acceptance_records",
    entityId: ar.id,
    payload: { project_id: ar.project_id, signoff_status: ar.signoff_status },
  });

  return NextResponse.json(ar, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  let body: { id?: number; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  if (body.action === "sign") {
    const ar = acceptanceRecordsRepo.sign(body.id);
    if (!ar) return NextResponse.json({ error: "not found" }, { status: 404 });
    const actor = req.headers.get("x-agentflow-user-id") || "consultant";
    record({
      actor,
      action: "acceptance.sign",
      entity: "acceptance_records",
      entityId: ar.id,
      payload: { customer_confirmed_at: ar.customer_confirmed_at },
    });
    return NextResponse.json(ar);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
