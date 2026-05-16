import Link from "next/link";
import { Card, PageHeader, Pill } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

const COMPLEXITIES = ["all", "simple", "medium", "complex"] as const;
type Complexity = (typeof COMPLEXITIES)[number];

function buildQuery(params: Record<string, string | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function TemplatesPage({
  searchParams,
}: {
  searchParams: { industry?: string; complexity?: string; q?: string };
}) {
  const industryFilter = (searchParams.industry ?? "").trim();
  const complexityFilter = COMPLEXITIES.includes((searchParams.complexity as Complexity) ?? "all" as Complexity)
    ? ((searchParams.complexity as Complexity) ?? "all")
    : "all";
  const query = (searchParams.q ?? "").trim().toLowerCase();

  const allIndustries = Array.from(new Set(TEMPLATES.flatMap((t) => t.industry))).sort();

  const filtered = TEMPLATES.filter((t) => {
    if (industryFilter && !t.industry.includes(industryFilter)) return false;
    if (complexityFilter !== "all" && t.complexity !== complexityFilter) return false;
    if (query) {
      const hay = [t.slug, t.name, t.short, ...t.industry].join(" ").toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="模板库"
        description={`${TEMPLATES.length} 个内置工作流模板。每个模板是顾问可重复销售的"产品"，含 Python 实现 + n8n 工作流 + 客户手册。`}
      />

      {/* Filter bar — GET form so query string is shareable. */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-forge-line bg-forge-panel/40 p-3">
        <label className="flex flex-col text-xs text-forge-muted">
          关键词
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="模板名 / slug / 行业"
            className="mt-1 w-56 rounded-md border border-forge-line bg-forge px-2 py-1.5 text-sm text-ink-100"
          />
        </label>
        <label className="flex flex-col text-xs text-forge-muted">
          行业
          <select
            name="industry"
            defaultValue={industryFilter}
            className="mt-1 rounded-md border border-forge-line bg-forge px-2 py-1.5 text-sm text-ink-100"
          >
            <option value="">全部</option>
            {allIndustries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-forge-muted">
          复杂度
          <select
            name="complexity"
            defaultValue={complexityFilter}
            className="mt-1 rounded-md border border-forge-line bg-forge px-2 py-1.5 text-sm text-ink-100"
          >
            {COMPLEXITIES.map((c) => (
              <option key={c} value={c}>{c === "all" ? "全部" : c}</option>
            ))}
          </select>
        </label>
        <button className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
          过滤
        </button>
        {(industryFilter || complexityFilter !== "all" || query) && (
          <Link href="/templates" className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm text-forge-muted hover:bg-forge-line/60">
            重置
          </Link>
        )}
        <div className="ml-auto text-xs text-forge-muted">
          匹配 <span className="text-ink-100">{filtered.length}</span> / {TEMPLATES.length}
        </div>
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-forge-line bg-forge-panel/40 p-8 text-center text-sm text-forge-muted">
          没有匹配的模板。<Link href="/templates" className="text-accent-400 hover:underline">重置筛选</Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.slug}
              href={`/templates/${t.slug}${buildQuery({ industry: industryFilter, complexity: complexityFilter !== "all" ? complexityFilter : null, q: query })}`}
            >
              <Card className="h-full cursor-pointer transition hover:border-accent-500">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-ink-50">{t.name}</div>
                    <div className="mt-0.5 text-xs text-forge-muted">{t.slug}</div>
                  </div>
                  <Pill tone={t.complexity === "simple" ? "success" : t.complexity === "medium" ? "warning" : "danger"}>
                    {t.complexity}
                  </Pill>
                </div>
                <div className="mt-2 text-sm text-ink-200">{t.short}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.industry.map((i) => (
                    <span key={i} className="rounded-full bg-forge-line/40 px-2 py-0.5 text-[10px] text-ink-200">{i}</span>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-forge-muted">推荐项目费</div>
                    <div className="text-ink-50">¥{(t.priceCents[0] / 100).toLocaleString()} - ¥{(t.priceCents[1] / 100).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-forge-muted">推荐月费</div>
                    <div className="text-ink-50">¥{(t.monthlyCents[0] / 100).toLocaleString()} - ¥{(t.monthlyCents[1] / 100).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-forge-muted">交付周期</div>
                    <div className="text-ink-50">{t.estDays} 个工作日</div>
                  </div>
                  <div>
                    <div className="text-forge-muted">ROI</div>
                    <div className="text-ink-50">{t.roi.headline}</div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
