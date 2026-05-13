import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { blueprintsRepo, projectsRepo } from "@/lib/repo";
import { fmtDate, safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function createBlueprint(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim() || "新蓝图";
  const projectId = formData.get("project_id") ? Number(formData.get("project_id")) : null;
  const bp = blueprintsRepo.create({
    project_id: projectId,
    name,
    spec: {
      nodes: [
        { id: "trigger-1", type: "trigger", label: "Webhook / 表单触发", x: 80, y: 200 },
        { id: "ai-1", type: "ai", label: "Claude 提取关键字段", x: 340, y: 200 },
        { id: "output-1", type: "output", label: "写表格 + 推送通知", x: 620, y: 200 },
      ],
      edges: [
        { from: "trigger-1", to: "ai-1" },
        { from: "ai-1", to: "output-1" },
      ],
    },
  });
  redirect(`/blueprints/${bp.id}`);
}

export default function BlueprintsListPage() {
  const list = blueprintsRepo.list();
  const projects = projectsRepo.list();
  const projectName = (id: number | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "（未挂接项目）");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="工作流蓝图"
        description="节点式建模：触发器 → 步骤 → 输出。保存后可用作交付规格。"
        action={
          <form action={createBlueprint} className="flex gap-2">
            <input
              name="name"
              placeholder="蓝图名称"
              className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm text-ink-50 focus:border-accent-500"
            />
            <button type="submit" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
              + 新建
            </button>
          </form>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          title="还没有蓝图"
          description="蓝图把客户工作流抽象成节点图，便于报价和开发"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((bp) => {
            const spec = safeJsonParse<{ nodes: { id: string }[]; edges: unknown[] }>(bp.spec_json, { nodes: [], edges: [] });
            return (
              <Link key={bp.id} href={`/blueprints/${bp.id}`}>
                <Card className="cursor-pointer transition hover:border-accent-500">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-ink-50">{bp.name}</div>
                    <Pill tone="neutral">{spec.nodes?.length || 0} 节点 / {spec.edges?.length || 0} 连接</Pill>
                  </div>
                  <div className="mt-1 text-xs text-forge-muted">所属项目：{projectName(bp.project_id)}</div>
                  <div className="mt-2 text-xs text-forge-muted">最近更新 {fmtDate(bp.updated_at)}</div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
