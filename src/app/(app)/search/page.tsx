import Link from "next/link";
import { Card, EmptyState, PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/current-user";
import { searchAll, type SearchKind } from "@/lib/search";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<SearchKind, string> = {
  lead: "线索",
  client: "客户",
  diagnostic: "诊断",
  project: "项目",
  import: "数据导入",
  package: "方案包",
  sow: "SOW",
  acceptance: "验收",
};

const KIND_HREF: Record<SearchKind, (id: number) => string> = {
  lead: (id) => `/leads/${id}`,
  client: (id) => `/clients/${id}`,
  diagnostic: (id) => `/diagnostics/${id}`,
  project: (id) => `/projects/${id}`,
  import: (id) => `/data-imports/${id}`,
  package: (id) => `/solution-packages/${id}`,
  sow: (id) => `/sow/${id}`,
  acceptance: (id) => `/projects/${id}/acceptance`,
};

const KIND_TONE: Record<SearchKind, "neutral" | "accent" | "warning" | "success"> = {
  lead: "warning",
  client: "success",
  diagnostic: "accent",
  project: "neutral",
  import: "neutral",
  package: "accent",
  sow: "warning",
  acceptance: "success",
};

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const me = await requireUser();
  const q = (searchParams.q ?? "").trim();
  const hits = q ? searchAll(q, me.permissions, 50) : [];

  // Group by kind for readability.
  const grouped = hits.reduce<Record<SearchKind, typeof hits>>(
    (acc, h) => ((acc[h.kind] = acc[h.kind] || []).push(h), acc),
    {} as Record<SearchKind, typeof hits>,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="全局搜索"
        description="使用 SQLite FTS5 跨线索 / 客户 / 诊断 / 项目搜索；结果按权限过滤。"
      />

      <Card>
        <form method="get" className="flex gap-2">
          <input
            autoFocus
            name="q"
            defaultValue={q}
            placeholder="公司 / 联系人 / 关键词..."
            className="flex-1 rounded-md border border-forge-line bg-forge px-3 py-2 text-sm text-ink-50 outline-none focus:border-accent-500"
          />
          <button type="submit" className="rounded-md bg-accent-500 px-3 py-2 text-sm font-medium text-forge hover:bg-accent-400">
            搜索
          </button>
        </form>
      </Card>

      {!q ? (
        <EmptyState title="输入关键词开始搜索" description="支持 ASCII 与中文。结果会高亮匹配片段，并按相关度排序。" />
      ) : hits.length === 0 ? (
        <EmptyState title={`没有匹配 "${q}" 的结果`} description="试试更短的关键词，或检查是否拼写错误。索引在每次进程启动后第一次搜索时自动构建。" />
      ) : (
        Object.entries(grouped).map(([kind, list]) => (
          <Card key={kind} className="p-0">
            <div className="border-b border-forge-line/60 px-5 py-3 text-xs uppercase tracking-wider text-forge-muted">
              <Pill tone={KIND_TONE[kind as SearchKind]}>{KIND_LABEL[kind as SearchKind]}</Pill>{" "}
              · <span className="text-ink-200">{list.length}</span> 条结果
            </div>
            <ul className="divide-y divide-forge-line/40">
              {list.map((h) => (
                <li key={`${h.kind}-${h.ref_id}`} className="px-5 py-3 hover:bg-forge-line/30">
                  <Link href={KIND_HREF[h.kind](h.ref_id)} className="block">
                    <div className="text-sm font-medium text-ink-50">{h.title}</div>
                    <div
                      className="mt-1 text-xs text-forge-muted"
                      dangerouslySetInnerHTML={{ __html: h.snippet.replace(/<mark>/g, '<mark class="bg-accent-500/30 text-accent-200 rounded px-0.5">') }}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
