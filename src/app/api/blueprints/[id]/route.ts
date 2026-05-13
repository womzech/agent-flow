import { NextResponse } from "next/server";
import { blueprintsRepo } from "@/lib/repo";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!blueprintsRepo.get(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as { spec?: unknown; name?: string };
  if (!body?.spec) return NextResponse.json({ error: "spec required" }, { status: 400 });
  const updated = blueprintsRepo.updateSpec(id, body.spec, body.name);
  return NextResponse.json({ ok: true, blueprint: updated });
}
