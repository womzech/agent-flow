/** Structured representation of an incoming WeCom message after decryption. */
export interface IncomingMessage {
  toUserName: string;       // = corpid
  fromUserName: string;     // = wecom userid (lowercase)
  createTime: number;       // unix seconds
  msgType: "text" | "image" | "voice" | "video" | "file" | "event" | "unknown";
  msgId?: string;
  agentId: number;

  // text
  content?: string;

  // media
  mediaId?: string;
  picUrl?: string;
  format?: string;

  // event
  event?: string;          // subscribe / unsubscribe / click / view / enter_agent / template_card_event
  eventKey?: string;

  // raw fields for diagnostic / unknown branches
  raw: Record<string, string>;
}

export function fromXmlFields(fields: Record<string, string>): IncomingMessage {
  const raw = (fields.MsgType || "text").toLowerCase();
  const known = ["text", "image", "voice", "video", "file", "event"] as const;
  type Known = (typeof known)[number];
  const isKnown = (s: string): s is Known => (known as readonly string[]).includes(s);
  const msgType: IncomingMessage["msgType"] = isKnown(raw) ? raw : "unknown";

  return {
    toUserName: fields.ToUserName ?? "",
    fromUserName: (fields.FromUserName ?? "").toLowerCase(),
    createTime: Number(fields.CreateTime) || Math.floor(Date.now() / 1000),
    msgType,
    msgId: fields.MsgId,
    agentId: Number(fields.AgentID) || 0,
    content: fields.Content,
    mediaId: fields.MediaId,
    picUrl: fields.PicUrl,
    format: fields.Format,
    event: fields.Event,
    eventKey: fields.EventKey,
    raw: fields,
  };
}
