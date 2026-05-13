import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { deliverablesRepo } from "@/lib/repo";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const d = deliverablesRepo.get(id);
  if (!d || !d.bundle_path) return NextResponse.json({ error: "no bundle yet" }, { status: 404 });
  if (!existsSync(d.bundle_path)) return NextResponse.json({ error: "bundle file missing" }, { status: 410 });
  const buf = readFileSync(d.bundle_path);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${basename(d.bundle_path)}"`,
      "content-length": String(buf.length),
    },
  });
}
