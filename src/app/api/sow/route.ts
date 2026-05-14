import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/csrf";
import { solutionPackagesRepo, sowRepo, generateSOWFromPackage } from "@/lib/delivery-os";
import { record } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });

  let body: { solution_package_id?: number; price_cents?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.solution_package_id) {
    return NextResponse.json({ error: "solution_package_id is required" }, { status: 400 });
  }

  const pkg = solutionPackagesRepo.get(body.solution_package_id);
  if (!pkg) return NextResponse.json({ error: "solution package not found" }, { status: 404 });

  const input = generateSOWFromPackage(pkg);
  if (typeof body.price_cents === "number" && body.price_cents > 0) {
    input.price_cents = body.price_cents;
  }

  const sow = sowRepo.create(input);

  const actor = req.headers.get("x-agentflow-user-id") || "consultant";
  record({
    actor,
    action: "sow.create",
    entity: "statement_of_work",
    entityId: sow.id,
    payload: { solution_package_id: pkg.id, project_id: sow.project_id, price_cents: sow.price_cents },
  });

  return NextResponse.json(sow, { status: 201 });
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

  if (body.action === "approve") {
    const sow = sowRepo.approve(body.id);
    if (!sow) return NextResponse.json({ error: "not found" }, { status: 404 });
    const actor = req.headers.get("x-agentflow-user-id") || "consultant";
    record({ actor, action: "sow.approve", entity: "statement_of_work", entityId: sow.id, payload: {} });
    return NextResponse.json(sow);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
