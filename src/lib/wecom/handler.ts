/**
 * Glue between the WeCom callback and the intent router. Catches any thrown
 * IntentError so we always return a polite reply rather than crashing.
 */

import { record } from "../audit";
import { sendMarkdown } from "./api";
import { describeError, dispatchIntent } from "./intent";
import type { IncomingMessage } from "./types";

export async function handleIncoming(msg: IncomingMessage): Promise<void> {
  if (msg.msgType === "event") {
    record({ action: "wecom.receive", entity: "wecom", payload: { event: msg.event, key: msg.eventKey } });
    return;
  }

  if (msg.msgType !== "text") {
    await sendMarkdown(
      { touser: msg.fromUserName },
      "目前只支持文本消息。试试 `/help` 查看可用指令。",
    );
    return;
  }

  let reply: string;
  let command: string;
  try {
    const result = await dispatchIntent(msg);
    reply = result.reply;
    command = result.command;
  } catch (err) {
    const userMessage = describeError(err);
    if (userMessage) {
      reply = userMessage;
      command = "error/intent";
    } else {
      reply = "处理时出错了，已记录到审计日志。请稍后重试或联系管理员。";
      command = "error/internal";
      record({
        action: "wecom.fail",
        entity: "wecom",
        payload: { stage: "intent", reason: (err as Error).message, from: msg.fromUserName },
      });
    }
  }

  const sendResult = await sendMarkdown({ touser: msg.fromUserName }, reply);
  record({
    action: sendResult.ok ? "wecom.reply" : "wecom.fail",
    entity: "wecom",
    payload: { to: msg.fromUserName, command, ok: sendResult.ok, errmsg: sendResult.errmsg },
  });
}
