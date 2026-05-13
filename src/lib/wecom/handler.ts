/**
 * Intent dispatch for inbound WeCom messages.
 *
 * v0.3 implementation (stage 7 stub): only routes by msgType and replies with
 * a friendly placeholder. The real command + LLM router lands in stage 8 via
 * `dispatchIntent()`.
 */

import { record } from "../audit";
import { sendMarkdown } from "./api";
import type { IncomingMessage } from "./types";

export async function handleIncoming(msg: IncomingMessage): Promise<void> {
  if (msg.msgType === "event") {
    // Subscribe / enter_agent etc — just log for now.
    return;
  }

  if (msg.msgType !== "text") {
    await sendMarkdown(
      { touser: msg.fromUserName },
      "目前只支持文本消息。试试 `/help` 查看可用指令。",
    );
    return;
  }

  // Stage 8 will replace this with `dispatchIntent(msg)`. For now we echo a
  // helpful banner so operators can verify the round trip end-to-end.
  const text = (msg.content ?? "").trim();
  const reply = text === "/help" || text === "help"
    ? buildHelp()
    : `收到："${text}"\n\n_intent router will land in commit 8。先用 \`/help\` 看看命令清单。_`;

  const sendResult = await sendMarkdown({ touser: msg.fromUserName }, reply);
  record({
    action: sendResult.ok ? "wecom.reply" : "wecom.fail",
    entity: "wecom",
    payload: { to: msg.fromUserName, ok: sendResult.ok, errmsg: sendResult.errmsg },
  });
}

function buildHelp(): string {
  return [
    "**AgentForge 企业微信指令**",
    "",
    "- `/help` 显示本帮助",
    "- `/me` 显示我的 AgentForge 账号 / 角色",
    "- `/pipeline` 销售管道速览",
    "- `/leads [stage]` 当前线索（默认 contacted/diagnosing/quoted）",
    "- `/projects` 活跃项目",
    "- 也可直接用中文提问，例如「越达玩具最近怎么样？」",
    "",
    "⚠️ 你需要在 AgentForge 的 /users 页绑定 wecom_userid 才能访问业务数据。",
  ].join("\n");
}
