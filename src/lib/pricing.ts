import { TEMPLATES, type Template } from "./templates";

export interface PricingInputs {
  templates: string[]; // slugs
  /** Estimated billable hours of customization on top of template defaults. */
  customizationHours: number;
  /** Hourly rate for the consultant (CNY). */
  hourlyRateCny: number;
  /** Whether the deal includes a 3-month maintenance retainer. */
  includeMonthly: boolean;
}

export interface PricingOutput {
  projectFeeCents: number;
  monthlyFeeCents: number;
  breakdown: { label: string; cents: number }[];
}

const DEFAULT_HOURLY = 800;

export function computePricing(input: PricingInputs): PricingOutput {
  const hourlyRate = input.hourlyRateCny || DEFAULT_HOURLY;
  const breakdown: { label: string; cents: number }[] = [];
  let projectCents = 0;
  let monthlyCents = 0;

  for (const slug of input.templates) {
    const t = TEMPLATES.find((x) => x.slug === slug);
    if (!t) continue;
    const mid = Math.round((t.priceCents[0] + t.priceCents[1]) / 2);
    projectCents += mid;
    breakdown.push({ label: `模板基准 · ${t.name}`, cents: mid });
    if (input.includeMonthly) {
      const m = Math.round((t.monthlyCents[0] + t.monthlyCents[1]) / 2);
      monthlyCents += m;
    }
  }

  const customCents = Math.round(input.customizationHours * hourlyRate * 100);
  if (customCents > 0) {
    projectCents += customCents;
    breakdown.push({ label: `定制工时 · ${input.customizationHours}h × ¥${hourlyRate}/h`, cents: customCents });
  }

  return { projectFeeCents: projectCents, monthlyFeeCents: monthlyCents, breakdown };
}

export function templateForPricing(slug: string): Template | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}
