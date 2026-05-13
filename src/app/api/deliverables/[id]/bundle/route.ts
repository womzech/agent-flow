import { NextResponse } from "next/server";
import { clientsRepo, deliverablesRepo, projectsRepo } from "@/lib/repo";
import { buildBundle } from "@/lib/bundler";
import { record } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const d = deliverablesRepo.get(id);
  if (!d) return NextResponse.json({ error: "deliverable not found" }, { status: 404 });
  const project = projectsRepo.get(d.project_id);
  const client = project?.client_id ? clientsRepo.get(project.client_id) : null;
  const paramsObj = deliverablesRepo.parseParams(d);

  try {
    const r = await buildBundle(id, {
      templateSlug: d.template_slug,
      params: Object.fromEntries(Object.entries(paramsObj).map(([k, v]) => [k, String(v ?? "")])),
      clientName: client?.company ?? "未填写",
      projectName: project?.name ?? `Deliverable #${id}`,
    });
    deliverablesRepo.markBundled(id, r.zipPath, r.zipSize);
    record({
      action: "deliverable.bundle",
      entity: "deliverable",
      entityId: id,
      payload: { template: d.template_slug, size: r.zipSize, files: r.files.length },
    });
    return NextResponse.json({ ok: true, files: r.files, size: r.zipSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
