/**
 * Intent router for inbound WeCom messages.
 *
 * Pipeline:
 *   1. Map wecom_userid → AgentForge User (via users.wecom_userid). If
 *      unbound: short, polite "please ask admin to link your account" reply.
 *   2. If text starts with "/": parse as slash command, dispatch.
 *   3. Else: ask Claude to classify the natural-language request into a
 *      command intent, then re-dispatch. Claude is given the user's role
 *      and permitted commands so it can refuse out-of-scope asks.
 *
 * Every reply also tells the user (in italics) which command / model was
 * used, so they can self-correct.
 */

import { record } from "../audit";
import { anthropic, DEFAULT_MODEL } from "../anthropic";
import { diagnosticsRepo, leadsRepo, projectsRepo, usersRepo, type User } from "../repo";
import { permissionsRepo } from "../repo";
import { LEAD_STAGE_LABELS, PROJECT_STATUS_LABELS, type LeadStage } from "../schema";
import { fmtCents, fmtDate } from "../utils";
import type { IncomingMessage } from "./types";

export interface RouterContext {
  user: User | null;
  permissions: Set<string>;
}

export interface IntentResult {
  /** Markdown body to send back to the user. */
  reply: string;
  /** Which command actually ran (for audit). */
  command: string;
}

/** Resolve the WeCom sender to an AgentForge user + their permissions. */
export function resolveSender(wecomUserid: string): RouterContext {
  const user = usersRepo.getByWecomUserid(wecomUserid) ?? null;
  if (!user || user.status !== "active") {
    return { user: null, permissions: new Set() };
  }
  return { user, permissions: permissionsRepo.permissionsForUser(user.id) as Set<string> };
}

const HELP = [
  "**AgentForge 企业微信指令**",
  "",
  "- `/help` 显示本帮助",
  "- `/me` 显示我的账号 / 角色 / 权限",
  "- `/pipeline` 销售管道速览",
  "- `/leads [stage]` 当前线索（默认 contacted/diagnosing/quoted）",
  "- `/projects` 活跃项目（pilot + retainer）",
  "- `/diag <关键词>` 搜索诊断报告",
  "- 直接输入中文问题（如「越达玩具最近怎么样？」）将由 AI 帮你查询。",
  "",
  "⚠️ 未绑定 AgentForge 账号的用户只能用 `/help` 和 `/me`。",
].join("\n");

/**
 * Main entry. Always returns a reply — never throws. Callers should still
 * try/catch to record `wecom.fail` if the send itself fails.
 */
export async function dispatchIntent(msg: IncomingMessage): Promise<IntentResult> {
  const text = (msg.content ?? "").trim();
  const ctx = resolveSender(msg.fromUserName);

  if (!text) return { command: "noop", reply: "（空消息）" + "\n\n" + HELP };

  // Slash command path.
  if (text.startsWith("/") || text.startsWith("、") || text.startsWith("、 ")) {
    const norm = text.replace(/^、\s*/, "/").trim();
    return await dispatchCommand(norm, ctx, msg);
  }

  // Natural-language path → ask Claude to pick a command.
  return await dispatchNaturalLanguage(text, ctx, msg);
}

async function dispatchCommand(text: string, ctx: RouterContext, msg: IncomingMessage): Promise<IntentResult> {
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/help":
    case "/h":
      return { command: "help", reply: HELP };
    case "/me":
      return { command: "me", reply: renderMe(ctx, msg) };
    case "/pipeline":
      requireBound(ctx);
      requirePerm(ctx, "read:leads");
      return { command: "pipeline", reply: renderPipeline() };
    case "/leads":
      requireBound(ctx);
      requirePerm(ctx, "read:leads");
      return { command: "leads", reply: renderLeads(arg) };
    case "/projects":
    case "/proj":
      requireBound(ctx);
      requirePerm(ctx, "read:projects");
      return { command: "projects", reply: renderProjects() };
    case "/diag":
    case "/diagnostic":
    case "/diagnostics":
      requireBound(ctx);
      requirePerm(ctx, "read:diagnostics");
      return { command: "diagnostics", reply: renderDiagnostics(arg) };
    default:
      return { command: "unknown", reply: `未识别的指令：\`${cmd}\`\n\n${HELP}` };
  }
}

function requireBound(ctx: RouterContext) {
  if (!ctx.user) {
    throw new IntentError(
      "你的企业微信账号尚未绑定 AgentForge 用户。\n\n请联系管理员在 `/users` 页面把你的 wecom_userid 添加到对应账号。",
    );
  }
}

function requirePerm(ctx: RouterContext, p: string) {
  if (!ctx.permissions.has(p)) {
    throw new IntentError(`你的角色没有 \`${p}\` 权限。请联系管理员。`);
  }
}

class IntentError extends Error {
  constructor(public reply: string) { super(reply); }
}

function renderMe(ctx: RouterContext, msg: IncomingMessage): string {
  if (!ctx.user) {
    return [
      "**未绑定账号**",
      "",
      `企业微信 userid: \`${msg.fromUserName}\``,
      "",
      "请联系管理员在 `/users` 页把这个 userid 添加到你的 AgentForge 账号。",
    ].join("\n");
  }
  const perms = Array.from(ctx.permissions).sort();
  return [
    `**${ctx.user.name}**（${ctx.user.email}）`,
    "",
    `- 角色：role_id=${ctx.user.role_id}`,
    `- 状态：${ctx.user.status}`,
    `- 企业微信 userid：\`${ctx.user.wecom_userid}\``,
    `- 权限（${perms.length}）：${perms.slice(0, 8).join(" · ") + (perms.length > 8 ? " …" : "")}`,
  ].join("\n");
}

function renderPipeline(): string {
  const counts = leadsRepo.countByStage();
  const lines = (Object.keys(counts) as LeadStage[]).map((s) => `- ${LEAD_STAGE_LABELS[s]}：**${counts[s]}**`);
  return ["**销售管道**", "", ...lines].join("\n");
}

function renderLeads(arg: string): string {
  const stages: LeadStage[] = arg
    ? (arg.split(/[,\s]+/).filter(Boolean) as LeadStage[])
    : (["contacted", "diagnosing", "quoted"] as LeadStage[]);
  const all = leadsRepo.list();
  const filtered = all.filter((l) => stages.includes(l.stage));
  if (filtered.length === 0) return "没有匹配阶段的线索。";
  return [
    `**${filtered.length} 条线索**（${stages.map((s) => LEAD_STAGE_LABELS[s]).join(" / ")}）`,
    "",
    ...filtered.slice(0, 15).map((l) =>
      `- **${l.company}** · ${LEAD_STAGE_LABELS[l.stage]} · ${l.name}${l.next_action ? ` · _next: ${l.next_action}_` : ""}`,
    ),
    filtered.length > 15 ? `\n_…仅显示前 15 条；其余在 Web 端查看。_` : "",
  ].join("\n");
}

function renderProjects(): string {
  const active = projectsRepo.list().filter((p) => p.status === "pilot" || p.status === "retainer");
  if (active.length === 0) return "暂无活跃项目。";
  return [
    `**${active.length} 个活跃项目**`,
    "",
    ...active.slice(0, 15).map((p) =>
      `- **${p.name}** · ${PROJECT_STATUS_LABELS[p.status]} · 项目费 ${fmtCents(p.project_fee_cents)} · 月 ${fmtCents(p.monthly_fee_cents)} · 启动 ${fmtDate(p.started_at)}`,
    ),
  ].join("\n");
}

function renderDiagnostics(arg: string): string {
  const all = diagnosticsRepo.list();
  const q = arg.toLowerCase();
  const filtered = q ? all.filter((d) => d.title.toLowerCase().includes(q)) : all;
  if (filtered.length === 0) return q ? `没有匹配 "${arg}" 的诊断报告。` : "还没有诊断报告。";
  return [
    `**${filtered.length} 份诊断**${q ? `（关键词：${arg}）` : ""}`,
    "",
    ...filtered.slice(0, 10).map((d) =>
      `- **${d.title}**\n  状态：${d.status} · 报价：${fmtCents(d.pricing_quote_cents)} · 月：${fmtCents(d.monthly_quote_cents)}${d.share_token ? `\n  分享：${d.share_token.slice(0, 8)}…` : ""}`,
    ),
  ].join("\n");
}

interface NlResult {
  action: "command" | "explain";
  command?: string;        // raw "/leads diagnosing" etc.
  text?: string;           // free-form reply when action=explain
  refusal?: string;        // when Claude refuses for permission reasons
}

async function dispatchNaturalLanguage(text: string, ctx: RouterContext, msg: IncomingMessage): Promise<IntentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      command: "nl-no-key",
      reply: "未配置 ANTHROPIC_API_KEY，无法解析自然语言请求。请直接用 `/help` 列出的命令。",
    };
  }
  const userDesc = ctx.user ? `${ctx.user.name} (${ctx.user.email})` : `未绑定企微 userid: ${msg.fromUserName}`;
  const permList = Array.from(ctx.permissions).sort().join(", ") || "（无权限）";

  const system = [
    "你是 AgentForge 企业微信交互助手。用户在企微里发了一条中文消息。",
    "你要把这条消息映射到一个 AgentForge 命令，并以严格的 JSON 输出。",
    "",
    "可用命令：",
    "- /help",
    "- /me",
    "- /pipeline",
    "- /leads [stage] (stage 是 lead/contacted/diagnosing/quoted/piloting/retainer/lost)",
    "- /projects",
    "- /diag <关键词>",
    "",
    "当前用户：" + userDesc,
    "拥有的权限：" + permList,
    "",
    "如果用户请求超出权限，把 action 设为 \"explain\"，text 字段写「你没有 X 权限」。",
    "如果可以用命令满足，把 action 设为 \"command\"，command 字段写完整命令（如 \"/leads diagnosing\"）。",
    "如果只是闲聊或问 \"你是谁\"，把 action 设为 \"explain\"，text 是中文回复（≤200 字）。",
    "",
    "只输出 JSON，不要额外文本。",
  ].join("\n");

  let parsed: NlResult | null = null;
  try {
    const resp = await anthropic().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: text }],
    });
    const body = resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    const j = body.match(/\{[\s\S]+\}/);
    if (j) parsed = JSON.parse(j[0]) as NlResult;
  } catch (err) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "nl-llm", reason: (err as Error).message } });
  }

  if (!parsed) {
    return { command: "nl-fallback", reply: "我没听懂，建议用 `/help` 看看命令清单。" };
  }
  if (parsed.action === "command" && parsed.command) {
    const sub = await dispatchCommand(parsed.command, ctx, msg).catch((e) => {
      if (e instanceof IntentError) return { command: "nl-refused", reply: e.reply };
      throw e;
    });
    return {
      command: `nl→${sub.command}`,
      reply: `${sub.reply}\n\n_由 AI 解析为 \`${parsed.command}\`_`,
    };
  }
  return { command: "nl-explain", reply: parsed.text || parsed.refusal || "（无回复内容）" };
}

// Catch IntentError in handler — non-throwing facade.
export function describeError(err: unknown): string | null {
  if (err instanceof IntentError) return err.message;
  return null;
}
