import { NextResponse } from "next/server";
import { blueprintsRepo } from "@/lib/repo";
import { record } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id", code: "params/invalid" }, { status: 400 });
  }
  if (!blueprintsRepo.get(id)) {
    return NextResponse.json({ error: "blueprint not found", code: "not-found" }, { status: 404 });
  }
  let body: { spec?: unknown; name?: string } = {};
  try {
    body = (await req.json()) as { spec?: unknown; name?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body", code: "body/invalid" }, { status: 400 });
  }
  if (!body.spec || typeof body.spec !== "object") {
    return NextResponse.json({ error: "spec required", code: "validation/failed", fields: { spec: "缺失或类型错误" } }, { status: 422 });
  }
  if (body.name && typeof body.name === "string" && body.name.length > 200) {
    return NextResponse.json({ error: "name too long", code: "validation/failed", fields: { name: "不超过 200 字符" } }, { status: 422 });
  }
  const updated = blueprintsRepo.updateSpec(id, body.spec, body.name);
  record({ action: "blueprint.update", entity: "blueprint", entityId: id });
  return NextResponse.json({ ok: true, blueprint: updated });
}
