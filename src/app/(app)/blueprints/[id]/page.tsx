import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { BlueprintCanvas, type BlueprintSpec } from "@/components/blueprints/canvas";
import { blueprintsRepo, projectsRepo } from "@/lib/repo";
import { safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function BlueprintDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const bp = blueprintsRepo.get(id);
  if (!bp) notFound();
  const spec = safeJsonParse<BlueprintSpec>(bp.spec_json, { nodes: [], edges: [] });
  const project = bp.project_id ? projectsRepo.get(bp.project_id) : null;

  return (
    <div>
      <PageHeader
        title={bp.name}
        description={project ? `所属项目：${project.name}` : "未挂接到项目"}
        action={
          <Link href="/blueprints" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            ← 列表
          </Link>
        }
      />
      <BlueprintCanvas blueprintId={id} initialSpec={spec} initialName={bp.name} />
    </div>
  );
}
