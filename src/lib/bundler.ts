import archiver from "archiver";
import { createWriteStream, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getTemplate, type Template } from "./templates";

const BUNDLES_DIR = resolve(process.cwd(), "data/bundles");

export function renderTemplate(body: string, params: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    return params[key] ?? `{{${key}}}`;
  });
}

export interface BundleContext {
  templateSlug: string;
  params: Record<string, string>;
  clientName: string;
  projectName: string;
}

export interface BundleResult {
  zipPath: string;
  zipSize: number;
  files: { name: string; bytes: number }[];
}

export async function buildBundle(deliverableId: number, ctx: BundleContext): Promise<BundleResult> {
  const t = getTemplate(ctx.templateSlug);
  if (!t) throw new Error(`unknown template: ${ctx.templateSlug}`);

  if (!existsSync(BUNDLES_DIR)) mkdirSync(BUNDLES_DIR, { recursive: true });
  const zipPath = resolve(BUNDLES_DIR, `deliverable-${deliverableId}-${ctx.templateSlug}.zip`);
  const tracked: { name: string; bytes: number }[] = [];

  const fullParams: Record<string, string> = {
    ...ctx.params,
    templateName: t.name,
    clientName: ctx.clientName,
    projectName: ctx.projectName,
    generatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
    roiFormula: t.roi.formula,
  };

  await new Promise<void>((resolveDone, rejectDone) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolveDone());
    output.on("error", rejectDone);
    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") rejectDone(err);
    });
    archive.on("error", rejectDone);
    archive.pipe(output);

    pushFile(archive, tracked, `${t.slug}.py`, renderTemplate(t.pythonTemplate, fullParams));
    pushFile(archive, tracked, "workflow.json", JSON.stringify(t.n8nTemplate, null, 2));
    pushFile(archive, tracked, "README.md", renderTemplate(t.readmeTemplate, fullParams));
    pushFile(archive, tracked, "requirements.txt", requirementsFor(t));
    pushFile(archive, tracked, "DELIVERY.md", renderDeliveryDoc(t, ctx));

    archive.finalize();
  });

  const { statSync } = await import("node:fs");
  const zipSize = statSync(zipPath).size;
  return { zipPath, zipSize, files: tracked };
}

function pushFile(
  archive: archiver.Archiver,
  tracked: { name: string; bytes: number }[],
  name: string,
  body: string,
) {
  const buf = Buffer.from(body, "utf-8");
  tracked.push({ name, bytes: buf.length });
  archive.append(buf, { name });
}

function requirementsFor(t: Template): string {
  const base = ["anthropic>=0.30"];
  if (t.slug === "excel-batch" || t.slug === "quote-generator") base.push("pandas>=2", "openpyxl>=3.1");
  if (t.slug === "doc-qa-bot") base.push("chromadb>=0.5", "fastapi>=0.110", "uvicorn>=0.27");
  if (t.slug === "price-monitor") base.push("requests>=2.31");
  return base.join("\n") + "\n";
}

function renderDeliveryDoc(t: Template, ctx: BundleContext): string {
  const today = new Date().toISOString().slice(0, 10);
  return `# 交付清单 / Delivery Manifest

> Project: ${ctx.projectName}
> Client: ${ctx.clientName}
> Template: ${t.name} (${t.slug})
> Delivered: ${today}

## 这个包里有什么

- \`${t.slug}.py\` — 主程序
- \`workflow.json\` — n8n 工作流（可选导入）
- \`requirements.txt\` — Python 依赖
- \`README.md\` — 客户侧使用手册
- \`DELIVERY.md\` — 本文件

## 验收标准

${t.outputs.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## 明确不包含

${t.excludes.map((o, i) => `${i + 1}. ${o}`).join("\n")}

## 维护说明

签订月度维护合同（建议 ¥${(t.monthlyCents[0] / 100).toLocaleString()} - ¥${(t.monthlyCents[1] / 100).toLocaleString()}/月）后包含：

- 模型 prompt 调优
- 数据源 / API 变更适配（如对方未做破坏性升级）
- 客户员工 30 分钟 / 月线上答疑

不包含：客户自身业务规则变更引起的需求迭代，按工时另议。
`;
}
