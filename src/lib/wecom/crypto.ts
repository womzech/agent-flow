/**
 * Pure functions implementing the WeCom (Enterprise WeChat) callback
 * encryption protocol. Spec:
 *   https://developer.work.weixin.qq.com/document/path/90968
 *
 * Why hand-rolled instead of @wecom/crypto / wxbizmsgcrypt?
 *  - Both packages are unmaintained and pull in cherry-pick crypto deps.
 *  - The protocol is small and stable; node:crypto provides everything.
 *  - Keeping the code in-tree lets us write deterministic unit tests
 *    against the canonical sample vector in the spec.
 *
 * The module is Node-only because it imports `node:crypto`. It must NEVER
 * be imported from `src/middleware.ts` or any Edge-runtime path. It is safe
 * to use from API routes and server actions.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const BLOCK_SIZE = 32;

/** Sign the 4-tuple (token, timestamp, nonce, encrypt) per spec. */
export function sign(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const sorted = [token, timestamp, nonce, encrypt].sort();
  return createHash("sha1").update(sorted.join("")).digest("hex");
}

/** Resolve EncodingAESKey → 32-byte AES key. */
export function aesKey(encodingAESKey: string): Buffer {
  // Spec: EncodingAESKey is 43 chars base64-ish; append "=" to make valid b64.
  const key = Buffer.from(encodingAESKey + "=", "base64");
  if (key.length !== 32) {
    throw new Error(`invalid EncodingAESKey: decoded length ${key.length}, expected 32`);
  }
  return key;
}

/** PKCS#7-style padding to a 32-byte block. Bytes 1-32 inclusive. */
function pad(buf: Buffer): Buffer {
  const padLen = BLOCK_SIZE - (buf.length % BLOCK_SIZE);
  const padded = Buffer.alloc(buf.length + padLen);
  buf.copy(padded);
  padded.fill(padLen, buf.length);
  return padded;
}

function unpad(buf: Buffer): Buffer {
  if (buf.length === 0) return buf;
  const padLen = buf[buf.length - 1];
  if (padLen < 1 || padLen > BLOCK_SIZE) return buf;
  return buf.subarray(0, buf.length - padLen);
}

export interface EncryptOptions {
  /** 16-byte random prefix. Provided in tests for determinism; defaults to crypto.randomBytes. */
  random?: Buffer;
}

/**
 * Encrypt a plaintext message into the base64 `Encrypt` field that WeCom
 * expects in a callback reply.
 *
 * Plaintext layout:
 *   random(16) || msgLen(4 BE) || msg(utf8) || receiveid(utf8)
 *
 * Then PKCS#7-padded to 32-byte blocks and AES-256-CBC encrypted with
 * IV = aesKey[0..16].
 */
export function encrypt(
  msg: string,
  encodingAESKey: string,
  receiveid: string,
  opts: EncryptOptions = {},
): string {
  const key = aesKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  const random = opts.random ?? randomBytes(16);
  if (random.length !== 16) throw new Error("random must be exactly 16 bytes");
  const msgBuf = Buffer.from(msg, "utf8");
  const recv = Buffer.from(receiveid, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(msgBuf.length, 0);

  const plain = Buffer.concat([random, lenBuf, msgBuf, recv]);
  const padded = pad(plain);

  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString("base64");
}

export interface DecryptResult {
  msg: string;
  receiveid: string;
}

/**
 * Inverse of `encrypt`. Validates the receiveid (corpid) when one is provided.
 * Throws on:
 *  - base64 decode failure
 *  - PKCS#7 over/under length
 *  - msgLen exceeding the decrypted buffer
 *  - receiveid mismatch (if expectedReceiveid is set)
 */
export function decrypt(
  encryptedBase64: string,
  encodingAESKey: string,
  expectedReceiveid?: string,
): DecryptResult {
  const key = aesKey(encodingAESKey);
  const iv = key.subarray(0, 16);
  const cipherBuf = Buffer.from(encryptedBase64, "base64");
  if (cipherBuf.length === 0 || cipherBuf.length % BLOCK_SIZE !== 0) {
    throw new Error("encrypted payload length not a 32-byte multiple");
  }

  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
  const plain = unpad(decrypted);
  if (plain.length < 20) throw new Error("decrypted payload too short");

  const msgLen = plain.readUInt32BE(16);
  if (msgLen < 0 || 20 + msgLen > plain.length) {
    throw new Error(`invalid msgLen=${msgLen}, buffer length=${plain.length}`);
  }
  const msg = plain.subarray(20, 20 + msgLen).toString("utf8");
  const receiveid = plain.subarray(20 + msgLen).toString("utf8");
  if (expectedReceiveid && receiveid !== expectedReceiveid) {
    throw new Error(`receiveid mismatch: got "${receiveid}", expected "${expectedReceiveid}"`);
  }
  return { msg, receiveid };
}

/**
 * Build the encrypted XML reply body WeCom expects from a callback response.
 * The shape is:
 *   <xml>
 *     <Encrypt><![CDATA[...]]></Encrypt>
 *     <MsgSignature><![CDATA[...]]></MsgSignature>
 *     <TimeStamp>...</TimeStamp>
 *     <Nonce><![CDATA[...]]></Nonce>
 *   </xml>
 */
export function buildReplyEnvelope(opts: {
  msg: string;
  token: string;
  encodingAESKey: string;
  receiveid: string;
  timestamp?: string;
  nonce?: string;
}): string {
  const ts = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomBytes(8).toString("hex");
  const enc = encrypt(opts.msg, opts.encodingAESKey, opts.receiveid);
  const sig = sign(opts.token, ts, nonce, enc);
  return [
    "<xml>",
    `<Encrypt><![CDATA[${enc}]]></Encrypt>`,
    `<MsgSignature><![CDATA[${sig}]]></MsgSignature>`,
    `<TimeStamp>${ts}</TimeStamp>`,
    `<Nonce><![CDATA[${nonce}]]></Nonce>`,
    "</xml>",
  ].join("");
}

/**
 * Extract the top-level fields from a callback request body. WeCom uses a
 * tiny XML dialect — we don't need a full parser, just <Tag>value</Tag> or
 * <Tag><![CDATA[value]]></Tag>. Returns an object map; missing fields → "".
 *
 * We deliberately scan in two passes (CDATA first, then plain) to avoid
 * relying on a single regex with both alternatives and a back-reference,
 * which the V8 RegExp engine handles inconsistently across versions.
 */
export function parseEnvelopeXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};

  // 1) CDATA-wrapped tags.
  const cdataRe = /<(\w+)>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/\1>/g;
  for (let m; (m = cdataRe.exec(xml)) !== null; ) {
    out[m[1]] = m[2];
  }

  // 2) Plain-text tags. Only fill keys not already captured above; skip
  //    tags whose body contains "<" (means it was a nested structure or
  //    a CDATA we already matched).
  const plainRe = /<(\w+)>([^<]*?)<\/\1>/g;
  for (let m; (m = plainRe.exec(xml)) !== null; ) {
    if (out[m[1]] === undefined) out[m[1]] = m[2];
  }

  return out;
}
