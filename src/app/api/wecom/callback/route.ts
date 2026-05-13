import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/audit";
import { readConfig } from "@/lib/wecom/api";
import { decrypt, parseEnvelopeXml, sign } from "@/lib/wecom/crypto";
import { fromXmlFields } from "@/lib/wecom/types";
import { handleIncoming } from "@/lib/wecom/handler";

// Force node runtime — node:crypto, in-process token cache, and `after`-style
// async work are all node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET handles URL verification when first configuring the callback in the
 * WeCom admin panel:
 *   GET /api/wecom/callback?msg_signature=&timestamp=&nonce=&echostr=
 *
 * Response: 200 plaintext body containing the decrypted echostr message.
 */
export async function GET(req: NextRequest) {
  const cfg = readConfig();
  if (!cfg) return new NextResponse("WeCom not configured", { status: 503 });

  const sp = req.nextUrl.searchParams;
  const msgSignature = sp.get("msg_signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";
  const echostr = sp.get("echostr") ?? "";

  const expected = sign(cfg.token, timestamp, nonce, echostr);
  if (expected !== msgSignature) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "verify", reason: "bad-signature" } });
    return new NextResponse("invalid signature", { status: 400 });
  }
  try {
    const { msg } = decrypt(echostr, cfg.encodingAESKey, cfg.corpId);
    record({ action: "wecom.verify", entity: "wecom", payload: { ok: true } });
    return new NextResponse(msg, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch (err) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "verify", reason: (err as Error).message } });
    return new NextResponse("decrypt failed", { status: 400 });
  }
}

/**
 * POST receives an encrypted message and immediately ACKs with empty body so
 * WeCom doesn't time out at 5s. The actual handling (intent routing, LLM
 * call, reply) runs in the background and pushes the reply via the WeCom
 * message/send API.
 */
export async function POST(req: NextRequest) {
  const cfg = readConfig();
  if (!cfg) return new NextResponse("WeCom not configured", { status: 503 });

  const sp = req.nextUrl.searchParams;
  const msgSignature = sp.get("msg_signature") ?? "";
  const timestamp = sp.get("timestamp") ?? "";
  const nonce = sp.get("nonce") ?? "";
  const xml = await req.text();

  const fields = parseEnvelopeXml(xml);
  const enc = fields.Encrypt;
  if (!enc) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "receive", reason: "no-encrypt" } });
    return new NextResponse("no Encrypt", { status: 400 });
  }
  const expected = sign(cfg.token, timestamp, nonce, enc);
  if (expected !== msgSignature) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "receive", reason: "bad-signature" } });
    return new NextResponse("invalid signature", { status: 400 });
  }

  let inner: ReturnType<typeof parseEnvelopeXml>;
  try {
    const { msg } = decrypt(enc, cfg.encodingAESKey, cfg.corpId);
    inner = parseEnvelopeXml(msg);
  } catch (err) {
    record({ action: "wecom.fail", entity: "wecom", payload: { stage: "decrypt", reason: (err as Error).message } });
    return new NextResponse("decrypt failed", { status: 400 });
  }

  const message = fromXmlFields(inner);
  record({
    action: "wecom.receive",
    entity: "wecom",
    payload: {
      from: message.fromUserName,
      msg_type: message.msgType,
      msg_id: message.msgId,
      preview: (message.content || message.event || "").slice(0, 100),
    },
  });

  // Fire-and-forget the handler so we ACK within 5s. Any LLM / DB work runs
  // after the response is on the wire. Errors are recorded to audit, never
  // re-thrown.
  queueMicrotask(async () => {
    try {
      await handleIncoming(message);
    } catch (err) {
      record({
        action: "wecom.fail",
        entity: "wecom",
        payload: { stage: "handler", reason: (err as Error).message, from: message.fromUserName },
      });
    }
  });

  // WeCom accepts empty body as ACK. We deliberately do NOT return an
  // encrypted passive reply — the async push above does the real reply.
  return new NextResponse("", { status: 200 });
}
