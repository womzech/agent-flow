import { NextRequest, NextResponse } from "next/server";
import { businessDataImportsRepo } from "@/lib/delivery-os";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const imp = businessDataImportsRepo.get(id);
  if (!imp) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(imp);
}
