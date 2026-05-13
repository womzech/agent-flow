import { NextRequest, NextResponse } from "next/server";
import { clientsRepo, deliverablesRepo, projectsRepo } from "@/lib/repo";
import { buildBundle } from "@/lib/bundler";
import { record } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";
import { applyHeaders, consume, ipFromHeaders } from "@/lib/ratelimit";
import { notifyEventAsync } from "@/lib/wecom/notify";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const csrfError = checkCsrf(req);
  if (csrfError) return NextResponse.json({ error: csrfError, code: "csrf/failed" }, { status: 403 });
  const id = Number(params.id);
  const d = deliverablesRepo.get(id);
  if (!d) return NextResponse.json({ error: "deliverable not found" }, { status: 404 });

  const userId = req.headers.get("x-agentflow-user-id") || ipFromHeaders(req.headers);
  const rl = consume({ route: "deliverable-bundle", key: userId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    const res = NextResponse.json(
      { error: "rate limited", code: "ratelimit/exceeded", retry_after_sec: rl.retryAfterSec },
      { status: 429 },
    );
    applyHeaders(res.headers, rl, 30);
    return res;
  }
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
    notifyEventAsync({
      kind: "deliverable.bundle",
      deliverable: { id, project_id: d.project_id, template_slug: d.template_slug, bundle_size_bytes: r.zipSize },
      project: project?.name,
      client: client?.company,
    });
    return NextResponse.json({ ok: true, files: r.files, size: r.zipSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
