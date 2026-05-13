/**
 * Outbound calls to the WeCom Open API: token caching + message send.
 *
 * Token strategy: in-memory single-process cache, ~7000s TTL (token validity
 * is 7200s, we give a 200s safety margin). A single in-flight Promise is
 * shared across concurrent callers so we never burn two API calls when a
 * cold instance gets two simultaneous notifications.
 *
 * If env vars aren't set this module exposes `isConfigured() === false` so
 * callers can degrade gracefully.
 */

import { record } from "../audit";

export interface WecomConfig {
  corpId: string;
  agentId: string;
  secret: string;
  token: string;
  encodingAESKey: string;
}

export function readConfig(): WecomConfig | null {
  const corpId = process.env.WECOM_CORP_ID || "";
  const agentId = process.env.WECOM_AGENT_ID || "";
  const secret = process.env.WECOM_SECRET || "";
  const token = process.env.WECOM_TOKEN || "";
  const encodingAESKey = process.env.WECOM_AES_KEY || "";
  if (!corpId || !secret || !agentId || !token || !encodingAESKey) return null;
  return { corpId, agentId, secret, token, encodingAESKey };
}

export function isConfigured(): boolean {
  return readConfig() !== null;
}

interface TokenCacheEntry { token: string; expiresAt: number }
let cache: TokenCacheEntry | null = null;
let inflight: Promise<string> | null = null;

const TOKEN_TTL_SAFETY_MS = 7000 * 1000;
const QYAPI_BASE = "https://qyapi.weixin.qq.com";

export async function getAccessToken(force = false): Promise<string> {
  const cfg = readConfig();
  if (!cfg) throw new Error("WECOM env not configured");
  if (!force && cache && cache.expiresAt > Date.now()) return cache.token;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const url = `${QYAPI_BASE}/cgi-bin/gettoken?corpid=${encodeURIComponent(cfg.corpId)}&corpsecret=${encodeURIComponent(cfg.secret)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`gettoken HTTP ${res.status}`);
      const body = (await res.json()) as { errcode?: number; errmsg?: string; access_token?: string; expires_in?: number };
      if (body.errcode && body.errcode !== 0) throw new Error(`gettoken errcode=${body.errcode} msg=${body.errmsg}`);
      if (!body.access_token) throw new Error("gettoken: no access_token in response");
      cache = { token: body.access_token, expiresAt: Date.now() + TOKEN_TTL_SAFETY_MS };
      return body.access_token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function _resetTokenCache() {
  cache = null;
  inflight = null;
}

export interface SendOptions {
  /** "user1|user2" or "@all" */
  touser?: string;
  toparty?: string;
  totag?: string;
  /** Most cases call sendText/sendMarkdown which derive these. */
  msgtype?: "text" | "markdown" | "news" | "textcard";
  text?: { content: string };
  markdown?: { content: string };
  safe?: 0 | 1;
}

export interface SendResult {
  ok: boolean;
  errcode?: number;
  errmsg?: string;
  invaliduser?: string;
  invalidparty?: string;
  invalidtag?: string;
  msgid?: string;
}

async function send(opts: SendOptions): Promise<SendResult> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, errcode: -1, errmsg: "wecom not configured" };
  const token = await getAccessToken();
  const url = `${QYAPI_BASE}/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`;
  const body = { agentid: Number(cfg.agentId), safe: 0, ...opts };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json()) as { errcode: number; errmsg: string; invaliduser?: string; invalidparty?: string; invalidtag?: string; msgid?: string };
  const ok = json.errcode === 0;
  if (!ok) {
    record({
      action: "wecom.fail",
      entity: "wecom",
      payload: { stage: "send", errcode: json.errcode, errmsg: json.errmsg, opts: { msgtype: opts.msgtype, touser: opts.touser } },
    });
  } else {
    record({
      action: "wecom.push",
      entity: "wecom",
      payload: { msgtype: opts.msgtype, touser: opts.touser, msgid: json.msgid },
    });
  }
  return { ok, ...json };
}

export function sendText(to: { touser?: string; toparty?: string; totag?: string }, content: string): Promise<SendResult> {
  return send({ ...to, msgtype: "text", text: { content } });
}

export function sendMarkdown(to: { touser?: string; toparty?: string; totag?: string }, content: string): Promise<SendResult> {
  return send({ ...to, msgtype: "markdown", markdown: { content } });
}

/** Default recipient list, derived from env. Falls back to "@all" if unset. */
export function defaultRecipients(): { touser: string } {
  const raw = (process.env.WECOM_DEFAULT_NOTIFY_USERS || "@all").trim();
  return { touser: raw || "@all" };
}
