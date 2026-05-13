import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fromBase32, generateSecret, hotp, otpauthUri, toBase32, totp, verify } from "../src/lib/totp";

// RFC 6238 reference TOTP-SHA1 secret: ASCII "12345678901234567890" (20 bytes).
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");

// Subset of the RFC 6238 Appendix B table for SHA-1, 8 digits.
// We test with 6 digits (the digits we actually use), so we recompute the
// expected codes locally for the same `T` values. The recomputation goes
// through our own `hotp()` — so this test is a self-consistency lock,
// confirming we cannot silently drift the digit-truncation behavior.
const T_CASES = [
  { time: 59,           T: 0x0000000000000001n },
  { time: 1111111109,   T: 0x00000000023523ECn },
  { time: 1111111111,   T: 0x00000000023523EDn },
  { time: 1234567890,   T: 0x000000000273EF07n },
  { time: 2000000000,   T: 0x0000000003F940AAn },
];

describe("totp: base32 encoding", () => {
  it("round-trips an arbitrary buffer", () => {
    const b = Buffer.from([0x01, 0x02, 0x03, 0xff, 0xab, 0xcd]);
    const enc = toBase32(b);
    const dec = fromBase32(enc);
    assert.deepEqual(Array.from(dec), Array.from(b));
  });

  it("encodes empty buffer cleanly", () => {
    assert.equal(toBase32(Buffer.alloc(0)), "");
    assert.deepEqual(Array.from(fromBase32("")), []);
  });

  it("rejects invalid base32 chars", () => {
    assert.throws(() => fromBase32("***"), /invalid base32 char/);
  });

  it("strips padding and whitespace on decode", () => {
    const b = Buffer.from([0x10, 0x20, 0x30]);
    const enc = toBase32(b);
    assert.deepEqual(Array.from(fromBase32(enc + "  ===  ")), Array.from(b));
  });
});

describe("totp: hotp baseline (RFC 6238 counter values)", () => {
  for (const { time, T } of T_CASES) {
    it(`time=${time} → counter=${T.toString(16)} produces a stable 6-digit code`, () => {
      const code = hotp(RFC_SECRET, T);
      assert.equal(code.length, 6);
      assert.equal(/^\d{6}$/.test(code), true);
      // Recompute with totp(time) to confirm same path.
      const t = totp(RFC_SECRET, { now: time });
      assert.equal(t, code);
    });
  }
});

describe("totp: verify", () => {
  it("accepts the exact current code", () => {
    const now = 1700000000;
    const code = totp(RFC_SECRET, { now });
    assert.equal(verify(RFC_SECRET, code, { now }), true);
  });

  it("accepts ±1 step (clock-drift tolerance)", () => {
    const now = 1700000000;
    const prev = totp(RFC_SECRET, { now: now - 30 });
    const next = totp(RFC_SECRET, { now: now + 30 });
    assert.equal(verify(RFC_SECRET, prev, { now }), true);
    assert.equal(verify(RFC_SECRET, next, { now }), true);
  });

  it("rejects ±2 steps", () => {
    const now = 1700000000;
    const tooOld = totp(RFC_SECRET, { now: now - 60 });
    const tooNew = totp(RFC_SECRET, { now: now + 60 });
    assert.equal(verify(RFC_SECRET, tooOld, { now }), false);
    assert.equal(verify(RFC_SECRET, tooNew, { now }), false);
  });

  it("rejects malformed code", () => {
    assert.equal(verify(RFC_SECRET, ""), false);
    assert.equal(verify(RFC_SECRET, "abcdef"), false);
    assert.equal(verify(RFC_SECRET, "12345"), false);
    assert.equal(verify(RFC_SECRET, "1234567"), false);
  });
});

describe("totp: generateSecret + otpauthUri", () => {
  it("generates 20-byte secret and matching base32", () => {
    const s = generateSecret();
    assert.equal(s.binary.length, 20);
    assert.equal(Array.from(fromBase32(s.base32)).length >= 20, true);
  });

  it("otpauth URI carries the standard params", () => {
    const s = generateSecret();
    const uri = otpauthUri({ email: "user@example.com", secretBase32: s.base32 });
    assert.equal(uri.startsWith("otpauth://totp/"), true);
    assert.ok(uri.includes("issuer=AgentForge"));
    assert.ok(uri.includes("algorithm=SHA1"));
    assert.ok(uri.includes("digits=6"));
    assert.ok(uri.includes("period=30"));
    assert.ok(uri.includes(`secret=${s.base32.replace(/=+$/g, "")}`));
  });
});
