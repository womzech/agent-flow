import Link from "next/link";
import { Card, PageHeader, Pill } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="模板库"
        description={`${TEMPLATES.length} 个内置工作流模板。每个模板是顾问可重复销售的"产品"，含 Python 实现 + n8n 工作流 + 客户手册。`}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Link key={t.slug} href={`/templates/${t.slug}`}>
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
    </div>
  );
}
