"use client";

import { useMemo, useState } from "react";
import { Card, PageHeader, Pill, Section } from "@/components/ui";

interface ClientTemplate {
  slug: string;
  name: string;
  short: string;
  estDays: number;
  priceCents: [number, number];
  monthlyCents: [number, number];
  complexity: string;
}

// Mirror of TEMPLATES — kept here as a static client-side list because the
// pricing calculator runs interactively. To regenerate, see scripts/regen-pricing-list.ts.
const TEMPLATES_FOR_PRICING: ClientTemplate[] = [
  { slug: "lead-intake", name: "销售线索自动录入", short: "表单/邮件 → AI 提取 → 表格 + 通知", estDays: 3, priceCents: [200000, 500000], monthlyCents: [50000, 100000], complexity: "simple" },
  { slug: "inquiry-reply", name: "外贸询盘智能回复", short: "客户询盘 → AI 匹配资料 → 回复草稿", estDays: 7, priceCents: [800000, 1500000], monthlyCents: [100000, 200000], complexity: "medium" },
  { slug: "quote-generator", name: "报价单一键生成", short: "清单 → AI 计算 + 套模板 → 报价单", estDays: 5, priceCents: [600000, 1200000], monthlyCents: [50000, 150000], complexity: "medium" },
  { slug: "doc-qa-bot", name: "知识库问答机器人", short: "PDF/Word/网页 → 向量库 → 聊天界面", estDays: 10, priceCents: [980000, 3000000], monthlyCents: [80000, 200000], complexity: "medium" },
  { slug: "excel-batch", name: "Excel 智能批处理", short: "Excel → AI 清洗/汇总 → 报表", estDays: 3, priceCents: [198000, 500000], monthlyCents: [30000, 80000], complexity: "simple" },
  { slug: "customer-service", name: "客服自动分类与回复", short: "微信/钉钉 → AI 分类 → 草稿", estDays: 7, priceCents: [600000, 1200000], monthlyCents: [80000, 150000], complexity: "medium" },
  { slug: "price-monitor", name: "工程材料价格监控", short: "抓取价格源 → 异常报警", estDays: 7, priceCents: [800000, 1800000], monthlyCents: [80000, 200000], complexity: "medium" },
];

const fmt = (cents: number) => "¥" + (cents / 100).toLocaleString("zh-CN");

export default function PricingPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [hours, setHours] = useState(8);
  const [rate, setRate] = useState(800);
  const [withMonthly, setWithMonthly] = useState(true);
  const [monthlyOccurrences, setMonthlyOccurrences] = useState(200);
  const [currentMinutes, setCurrentMinutes] = useState(20);
  const [hourlyCostCny, setHourlyCostCny] = useState(100);

  const breakdown = useMemo(() => {
    const items: { label: string; cents: number }[] = [];
    let projectCents = 0;
    let monthlyCents = 0;
    for (const slug of selected) {
      const t = TEMPLATES_FOR_PRICING.find((x) => x.slug === slug);
      if (!t) continue;
      const mid = Math.round((t.priceCents[0] + t.priceCents[1]) / 2);
      projectCents += mid;
      items.push({ label: `模板基准 · ${t.name}`, cents: mid });
      if (withMonthly) monthlyCents += Math.round((t.monthlyCents[0] + t.monthlyCents[1]) / 2);
    }
    const cust = Math.round(hours * rate * 100);
    if (cust > 0) {
      projectCents += cust;
      items.push({ label: `定制工时 ${hours}h × ¥${rate}/h`, cents: cust });
    }
    const monthlySavedHours = (currentMinutes * monthlyOccurrences * 0.7) / 60;
    const monthlyValue = monthlySavedHours * hourlyCostCny * 100;
    const payback = monthlyValue > 0 ? Math.max(1, Math.round((projectCents / monthlyValue) * 10) / 10) : null;
    return { items, projectCents, monthlyCents, monthlyValueCents: monthlyValue, monthlySavedHours: Math.round(monthlySavedHours * 10) / 10, payback };
  }, [selected, hours, rate, withMonthly, monthlyOccurrences, currentMinutes, hourlyCostCny]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="报价计算器" description="选模板 + 估工时 + 算 ROI = 给客户的清单价" />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="选模板">
          <div className="grid gap-2">
            {TEMPLATES_FOR_PRICING.map((t) => {
              const active = selected.includes(t.slug);
              return (
                <Card
                  key={t.slug}
                  className={`cursor-pointer transition ${active ? "border-accent-500" : ""}`}
                  onClick={() => setSelected((arr) => (active ? arr.filter((x) => x !== t.slug) : [...arr, t.slug]))}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-ink-50">{t.name}</div>
                      <div className="text-xs text-forge-muted">{t.short}</div>
                    </div>
                    <div className="text-right text-xs">
                      <Pill tone={t.complexity === "simple" ? "success" : "warning"}>{t.complexity}</Pill>
                      <div className="mt-1 text-ink-100">{fmt(t.priceCents[0])} - {fmt(t.priceCents[1])}</div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Section>

        <div className="space-y-5">
          <Section title="定制工时">
            <Card className="space-y-3">
              <label className="block text-sm">
                <span className="text-ink-100">定制工时（小时）：{hours}</span>
                <input type="range" min={0} max={80} step={1} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="block text-sm">
                <span className="text-ink-100">小时单价（CNY）：¥{rate}</span>
                <input type="range" min={300} max={2000} step={50} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-100">
                <input type="checkbox" checked={withMonthly} onChange={(e) => setWithMonthly(e.target.checked)} />
                包含月度维护合同
              </label>
            </Card>
          </Section>

          <Section title="ROI 输入">
            <Card className="space-y-3">
              <label className="block text-sm">
                <span className="text-ink-100">每次任务现状耗时（分钟）：{currentMinutes}</span>
                <input type="range" min={5} max={180} step={5} value={currentMinutes} onChange={(e) => setCurrentMinutes(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="block text-sm">
                <span className="text-ink-100">月发生次数：{monthlyOccurrences}</span>
                <input type="range" min={10} max={2000} step={10} value={monthlyOccurrences} onChange={(e) => setMonthlyOccurrences(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <label className="block text-sm">
                <span className="text-ink-100">客户人力时薪（CNY）：¥{hourlyCostCny}</span>
                <input type="range" min={50} max={500} step={10} value={hourlyCostCny} onChange={(e) => setHourlyCostCny(Number(e.target.value))} className="mt-1 w-full" />
              </label>
            </Card>
          </Section>
        </div>
      </div>

      <Section title="计算结果">
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <div className="text-xs uppercase tracking-wider text-forge-muted">推荐项目费</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">{fmt(breakdown.projectCents)}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wider text-forge-muted">推荐月度维护费</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">{fmt(breakdown.monthlyCents)}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wider text-forge-muted">回本周期</div>
            <div className="mt-2 text-2xl font-semibold text-ink-50">{breakdown.payback ? `${breakdown.payback} 个月` : "—"}</div>
            <div className="text-xs text-forge-muted">客户每月节省约 {breakdown.monthlySavedHours} 小时 / {fmt(breakdown.monthlyValueCents)}</div>
          </Card>
        </div>
        {breakdown.items.length > 0 ? (
          <Card className="mt-3">
            <div className="text-xs uppercase tracking-wider text-forge-muted">明细</div>
            <ul className="mt-2 divide-y divide-forge-line/60 text-sm">
              {breakdown.items.map((b, i) => (
                <li key={i} className="flex items-center justify-between py-2">
                  <span className="text-ink-100">{b.label}</span>
                  <span className="text-ink-50">{fmt(b.cents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </Section>
    </div>
  );
}
