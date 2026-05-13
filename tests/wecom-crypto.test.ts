import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { aesKey, buildReplyEnvelope, decrypt, encrypt, parseEnvelopeXml, sign } from "../src/lib/wecom/crypto";

const TOKEN = "QDG6eK";
const CORPID = "wx5823bf96d3bd56c7";
// Canonical 43-character EncodingAESKey from the WeCom sample (`jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C`).
const AES_KEY = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";

describe("wecom/crypto: aesKey", () => {
  it("decodes EncodingAESKey to 32 bytes", () => {
    const k = aesKey(AES_KEY);
    assert.equal(k.length, 32);
  });

  it("rejects malformed key", () => {
    assert.throws(() => aesKey("too-short"), /invalid EncodingAESKey/);
  });
});

describe("wecom/crypto: sign", () => {
  it("sorts the 4-tuple lexicographically before hashing", () => {
    const s1 = sign(TOKEN, "1409659813", "1372623149", "encryptedmsg");
    const s2 = sign(TOKEN, "1409659813", "1372623149", "encryptedmsg");
    assert.equal(s1, s2);
    assert.equal(s1.length, 40, "SHA1 hex digest is 40 chars");
  });

  it("changes when any input changes", () => {
    const a = sign(TOKEN, "1", "n", "e");
    const b = sign(TOKEN, "2", "n", "e");
    assert.notEqual(a, b);
  });
});

describe("wecom/crypto: encrypt → decrypt round trip", () => {
  it("decrypt(encrypt(msg)) === msg with corpid recovered", () => {
    const msg = "hello 企业微信 🚀";
    const enc = encrypt(msg, AES_KEY, CORPID);
    const dec = decrypt(enc, AES_KEY, CORPID);
    assert.equal(dec.msg, msg);
    assert.equal(dec.receiveid, CORPID);
  });

  it("works for XML-shaped messages (the realistic case)", () => {
    const xml = "<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content></xml>";
    const enc = encrypt(xml, AES_KEY, CORPID);
    const dec = decrypt(enc, AES_KEY, CORPID);
    assert.equal(dec.msg, xml);
  });

  it("uses a deterministic random when provided (for fuzzing)", () => {
    const fixed = Buffer.alloc(16, 0x41); // 16 × 'A'
    const a = encrypt("payload", AES_KEY, CORPID, { random: fixed });
    const b = encrypt("payload", AES_KEY, CORPID, { random: fixed });
    assert.equal(a, b, "same random + plaintext → same ciphertext");
  });

  it("produces different ciphertexts with default random", () => {
    const a = encrypt("payload", AES_KEY, CORPID);
    const b = encrypt("payload", AES_KEY, CORPID);
    assert.notEqual(a, b);
  });

  it("rejects mismatched receiveid in decrypt", () => {
    const enc = encrypt("hi", AES_KEY, CORPID);
    assert.throws(() => decrypt(enc, AES_KEY, "ww9999999999999999"), /receiveid mismatch/);
  });

  it("rejects tampered ciphertext (length must be multiple of 32)", () => {
    const enc = encrypt("hi", AES_KEY, CORPID);
    const trimmed = enc.slice(0, enc.length - 4);
    assert.throws(() => decrypt(trimmed, AES_KEY, CORPID));
  });

  it("rejects garbage non-base64 input", () => {
    assert.throws(() => decrypt("!!!!", AES_KEY, CORPID));
  });
});

describe("wecom/crypto: buildReplyEnvelope", () => {
  it("returns a well-formed envelope with signature matching contents", () => {
    const env = buildReplyEnvelope({
      msg: "<xml><MsgType><![CDATA[text]]></MsgType></xml>",
      token: TOKEN,
      encodingAESKey: AES_KEY,
      receiveid: CORPID,
      timestamp: "1409659813",
      nonce: "1372623149",
    });
    const parsed = parseEnvelopeXml(env);
    assert.ok(parsed.Encrypt);
    assert.ok(parsed.MsgSignature);
    assert.equal(parsed.TimeStamp, "1409659813");
    assert.equal(parsed.Nonce, "1372623149");
    const expectedSig = sign(TOKEN, "1409659813", "1372623149", parsed.Encrypt);
    assert.equal(parsed.MsgSignature, expectedSig);
  });
});

describe("wecom/crypto: parseEnvelopeXml", () => {
  it("extracts CDATA-wrapped fields", () => {
    const out = parseEnvelopeXml(
      "<xml><ToUserName><![CDATA[wx123]]></ToUserName><AgentID>1000002</AgentID><Encrypt><![CDATA[ABC=]]></Encrypt></xml>",
    );
    assert.equal(out.ToUserName, "wx123");
    assert.equal(out.AgentID, "1000002");
    assert.equal(out.Encrypt, "ABC=");
  });

  it("returns empty object for unrelated XML", () => {
    const out = parseEnvelopeXml("<random>nothing here</random>");
    assert.deepEqual(Object.keys(out), ["random"]);
  });
});
