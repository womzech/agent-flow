import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Pill, Section } from "@/components/ui";
import { getTemplate } from "@/lib/templates";
import { renderMarkdown } from "@/lib/utils";

export default function TemplateDetailPage({ params }: { params: { slug: string } }) {
  const t = getTemplate(params.slug);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t.name}
        description={t.short}
        action={
          <Link href="/templates" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
            ← 模板库
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">复杂度</div>
          <div className="mt-1"><Pill tone={t.complexity === "simple" ? "success" : t.complexity === "medium" ? "warning" : "danger"}>{t.complexity}</Pill></div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">推荐项目费</div>
          <div className="mt-1 text-base font-semibold text-ink-50">¥{(t.priceCents[0] / 100).toLocaleString()} - ¥{(t.priceCents[1] / 100).toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">推荐月费</div>
          <div className="mt-1 text-base font-semibold text-ink-50">¥{(t.monthlyCents[0] / 100).toLocaleString()} - ¥{(t.monthlyCents[1] / 100).toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">交付天数</div>
          <div className="mt-1 text-base font-semibold text-ink-50">{t.estDays} 个工作日</div>
        </Card>
      </div>

      <Section title="ROI" description="给客户算账时直接引用">
        <Card>
          <div className="text-sm text-ink-100">{t.roi.headline}</div>
          <div className="mt-2 rounded-md border border-forge-line/60 bg-forge p-3 text-xs text-forge-muted">{t.roi.formula}</div>
        </Card>
      </Section>

      <Section title="客户需要提供（Inputs）">
        <Card>
          <ul className="ml-5 list-disc space-y-1 text-sm text-ink-100">
            {t.inputs.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </Card>
      </Section>

      <Section title="交付物（Outputs）">
        <Card>
          <ul className="ml-5 list-disc space-y-1 text-sm text-ink-100">
            {t.outputs.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </Card>
      </Section>

      <Section title="明确不包含（Excludes）" description="提前管理预期，避免交付争议">
        <Card>
          <ul className="ml-5 list-disc space-y-1 text-sm text-rose-200">
            {t.excludes.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        </Card>
      </Section>

      <Section title="参数（顾问视角）" description="新项目用这些参数生成定制交付包">
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forge-line/60 text-left text-xs text-forge-muted">
                <th className="py-2">key</th>
                <th>标签</th>
                <th>默认</th>
              </tr>
            </thead>
            <tbody>
              {t.params.map((p) => (
                <tr key={p.key} className="border-b border-forge-line/40">
                  <td className="py-2 font-mono text-xs text-accent-300">{p.key}</td>
                  <td className="text-ink-100">{p.label}</td>
                  <td className="text-forge-muted">{p.default || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="客户使用手册（README 模板）">
        <Card className="prose-forge" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.readmeTemplate) }} />
      </Section>

      <Section title="定价说明" description="顾问内部参考，不要直接发给客户">
        <Card>
          <p className="text-sm text-ink-200">{t.pricingNote}</p>
        </Card>
      </Section>
    </div>
  );
}
