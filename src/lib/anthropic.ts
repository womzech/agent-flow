import Anthropic from "@anthropic-ai/sdk";
import { TEMPLATES, templateSummary } from "./templates";
import { log } from "./log";

let _client: Anthropic | undefined;
let _testClient: unknown = null;

export function anthropic(): Anthropic {
  if (_testClient) return _testClient as Anthropic;
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set. See .env.example.");
    _client = new Anthropic({ apiKey, maxRetries: 0, timeout: 60_000 });
  }
  return _client;
}

/** Test seam — override the SDK with a fake. Call __setClientForTest(null) to restore. */
export function __setClientForTest(client: unknown): void {
  _testClient = client;
}

export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const REQUEST_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS) || 60_000;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.ANTHROPIC_MAX_ATTEMPTS) || 3);

function isRetriableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string; code?: string };
  if (e.status === 429) return true;
  if (typeof e.status === "number" && e.status >= 500) return true;
  if (e.name === "APIConnectionTimeoutError" || e.name === "APIConnectionError") return true;
  if (e.code === "ECONNRESET" || e.code === "ETIMEDOUT") return true;
  return false;
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS || !isRetriableError(err)) {
        log.error("anthropic.call.failed", { label, attempt, err: String(err) });
        throw err;
      }
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      log.warn("anthropic.call.retry", { label, attempt, backoffMs, err: String(err) });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

export interface DiagnosticQuestionnaire {
  company: {
    name: string;
    industry: string;
    size: string; // e.g. "10-50人 / 年营收 500-2000万"
    location?: string;
  };
  workflows: {
    name: string;
    currentMinutesPerOccurrence: number;
    occurrencesPerMonth: number;
    headcountInvolved: number;
    currentTools: string[];
    failureMode?: string;
  }[];
  existingSystems: string[]; // e.g. "Excel", "钉钉", "孚盟CRM"
  budget: {
    oneTimeCents?: number;
    monthlyCents?: number;
    note?: string;
  };
  goals: string[];
  riskTolerance?: "low" | "medium" | "high";
  decisionMaker?: string;
}

export interface DiagnosticResult {
  reportMarkdown: string;
  recommendedTemplates: string[];
  pricingQuoteCents: number;
  monthlyQuoteCents: number;
  modelUsed: string;
}

const SYSTEM_PROMPT = `你是 AI 工作流诊断顾问。客户是中小企业老板，你要写一份「诊断报告」。

报告必须包含且只包含以下章节，按顺序：

# AI 工作流诊断报告

## 1. 现状速览
（用 2-3 段总结客户行业、规模、当前痛点）

## 2. 高频重复工作流梳理
（针对客户填写的每个工作流，给一个二级标题，分析当前耗时和痛点）

## 3. 自动化机会矩阵
（一张 Markdown 表格，列：工作流 / 自动化难度 / 预估每月节省小时 / 优先级 / 建议模板）
建议模板必须从「可用模板库」中选择对应 slug。

## 4. 推荐试点范围
（明确推荐 1-2 个最优先的工作流作为试点；说明为什么是这两个；不要承诺超过 80% 自动化）

## 5. ROI 估算
（用 markdown 列出计算公式 + 一次性 / 月度费用 vs 预计每月节省人力成本对比表）

## 6. 报价建议
（一段话给出试点项目费区间 + 月度维护费区间，必须落在「可用模板库」对应价格范围内，
并解释为什么这个价。区间下沿对应"最小可用"，上沿对应"完整方案"。）

## 7. 不在范围内的事项
（明确列出 3-5 条本次不承诺的事项，例如「不替代 CRM 长期跟进」「不承诺成交率提升」）

## 8. 下一步建议
（3 条具体的下一步：1）安排试点签约会议 2）准备的资料清单 3）期望交付时间）

风格要求：
- 用中文。
- 客观直白，不要营销腔。
- 引用客户提供的具体数字（耗时、频次、人数）。
- 表格用 GitHub Markdown 语法。
- 总长度 800-1500 字。
- 不要在报告里说 "作为 AI" 或 "我是 Claude"。

最后在报告 markdown 之后，单独输出一段 JSON（用 \`\`\`json fenced），结构：
{
  "recommendedTemplates": ["slug1", "slug2"],   // 至多 3 个，按优先级排序
  "pricingQuoteCents": 30000_00,                // 项目费推荐报价（一个具体数值，不是区间）
  "monthlyQuoteCents": 1500_00                  // 月费推荐报价
}
`;

export async function generateDiagnostic(q: DiagnosticQuestionnaire, opts?: { model?: string }): Promise<DiagnosticResult> {
  const model = opts?.model || DEFAULT_MODEL;
  const templateCatalog = TEMPLATES.map((t) => "- " + templateSummary(t)).join("\n");

  // Prompt caching: system prompt + template catalog stay near-constant across
  // every diagnostic. Mark them as cache_control=ephemeral so they get a 5-min
  // TTL discount on subsequent calls. Only the questionnaire JSON is "hot".
  const systemBlocks = [
    { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: `可用模板库：\n${templateCatalog}`, cache_control: { type: "ephemeral" as const } },
  ];
  const userMsg = `客户问卷（JSON）：\n\`\`\`json\n${JSON.stringify(q, null, 2)}\n\`\`\`\n\n请基于「可用模板库」生成诊断报告。`;

  const t0 = Date.now();
  const resp = await withRetry("generateDiagnostic", () =>
    anthropic().messages.create(
      {
        model,
        max_tokens: 3500,
        system: systemBlocks,
        messages: [{ role: "user", content: userMsg }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    ),
  );
  const usage = (resp as unknown as { usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number; input_tokens?: number; output_tokens?: number } }).usage ?? {};
  log.info("anthropic.diagnostic.done", {
    model,
    ms: Date.now() - t0,
    input: usage.input_tokens,
    output: usage.output_tokens,
    cache_read: usage.cache_read_input_tokens,
    cache_creation: usage.cache_creation_input_tokens,
  });

  const text = resp.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Split into report markdown + trailing JSON block.
  const jsonMatch = text.match(/```json\s*([\s\S]+?)```/);
  let recommendedTemplates: string[] = [];
  let pricingQuoteCents = 0;
  let monthlyQuoteCents = 0;
  let reportMarkdown = text;
  if (jsonMatch) {
    reportMarkdown = text.slice(0, jsonMatch.index).trim();
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed.recommendedTemplates)) recommendedTemplates = parsed.recommendedTemplates;
      if (typeof parsed.pricingQuoteCents === "number") pricingQuoteCents = parsed.pricingQuoteCents;
      if (typeof parsed.monthlyQuoteCents === "number") monthlyQuoteCents = parsed.monthlyQuoteCents;
    } catch {
      /* ignore JSON parse errors and keep defaults */
    }
  }

  return { reportMarkdown, recommendedTemplates, pricingQuoteCents, monthlyQuoteCents, modelUsed: model };
}

/**
 * Build a fallback diagnostic when no API key is configured — used by the seed
 * script and by `?demo=1` previews. Never throws.
 */
export function fallbackDiagnostic(q: DiagnosticQuestionnaire): DiagnosticResult {
  const wf = q.workflows[0];
  const monthlySavedMinutes = q.workflows.reduce(
    (acc, w) => acc + w.currentMinutesPerOccurrence * w.occurrencesPerMonth * 0.7,
    0,
  );
  const savedHours = Math.round(monthlySavedMinutes / 60);
  const md = `# AI 工作流诊断报告

> ⚠️ 本报告由本地占位模板生成（未连接 Anthropic API）。配置 \`ANTHROPIC_API_KEY\` 后可获得正式版本。

## 1. 现状速览
${q.company.name}（${q.company.industry}，${q.company.size}）当前依赖 ${q.existingSystems.join(" / ") || "Excel + 微信"} 处理日常业务。从问卷反馈来看，存在 ${q.workflows.length} 个高频重复工作流。

## 2. 高频重复工作流梳理
${q.workflows
  .map(
    (w, i) =>
      `### 2.${i + 1} ${w.name}\n- 单次耗时：${w.currentMinutesPerOccurrence} 分钟\n- 每月发生次数：${w.occurrencesPerMonth}\n- 涉及人数：${w.headcountInvolved}\n- 当前工具：${w.currentTools.join(" / ")}\n- 主要失败模式：${w.failureMode ?? "未填写"}`,
  )
  .join("\n\n")}

## 3. 自动化机会矩阵

| 工作流 | 自动化难度 | 预估每月节省小时 | 优先级 | 建议模板 |
|---|---|---|---|---|
${q.workflows
  .map((w, i) => `| ${w.name} | 中 | ${Math.round((w.currentMinutesPerOccurrence * w.occurrencesPerMonth * 0.7) / 60)} | P${i + 1} | lead-intake |`)
  .join("\n")}

## 4. 推荐试点范围
首期建议聚焦 **${wf?.name ?? "首要工作流"}**。理由：发生频次高，自动化天花板清晰，1-2 周可见效。

## 5. ROI 估算
- 每月节省工时 ≈ **${savedHours} 小时**
- 按 ¥100/小时计，每月节省人力成本 ≈ ¥${savedHours * 100}
- 试点项目费 ¥30,000，约 2-3 个月回本

## 6. 报价建议
- 试点项目：¥30,000 - ¥50,000（视模板组合）
- 月度维护：¥1,000 - ¥3,000

## 7. 不在范围内的事项
- 不替代 CRM 的长期客户跟进
- 不承诺线索转化率提升
- 不接管客户的财务 / 法务流程

## 8. 下一步建议
1. 约下周二上午 10:00 试点签约电话。
2. 客户准备：近 30 天的典型工作样本各 3-5 份。
3. 期望交付：签约后 7-10 个工作日内完成第一个工作流上线。
`;
  return {
    reportMarkdown: md,
    recommendedTemplates: ["lead-intake"],
    pricingQuoteCents: 3000000,
    monthlyQuoteCents: 200000,
    modelUsed: "fallback",
  };
}
