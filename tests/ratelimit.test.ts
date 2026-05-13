import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _resetForTest, _setClockForTest, consume, applyHeaders, ipFromHeaders } from "../src/lib/ratelimit";

describe("ratelimit: consume", () => {
  beforeEach(() => _resetForTest());

  it("first call succeeds and decrements tokens", () => {
    let t = 1_000_000_000;
    _setClockForTest(() => t);
    const r = consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 });
    assert.equal(r.ok, true);
    assert.equal(r.remaining, 2);
  });

  it("hits the limit then rejects with retryAfterSec > 0", () => {
    let t = 1_000_000_000;
    _setClockForTest(() => t);
    for (let i = 0; i < 3; i++) consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 });
    const r = consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 });
    assert.equal(r.ok, false);
    assert.equal(r.remaining, 0);
    assert.equal(r.retryAfterSec > 0 && r.retryAfterSec <= 60, true);
  });

  it("refills after window elapses", () => {
    let t = 0;
    _setClockForTest(() => t);
    for (let i = 0; i < 3; i++) consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 });
    assert.equal(consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 }).ok, false);
    t += 60_001;
    const refilled = consume({ route: "test", key: "k", limit: 3, windowMs: 60_000 });
    assert.equal(refilled.ok, true);
    assert.equal(refilled.remaining, 2);
  });

  it("isolates buckets by route+key", () => {
    _setClockForTest(() => 0);
    consume({ route: "a", key: "k", limit: 1, windowMs: 60_000 });
    const aSecond = consume({ route: "a", key: "k", limit: 1, windowMs: 60_000 });
    const bFirst = consume({ route: "b", key: "k", limit: 1, windowMs: 60_000 });
    const aOtherKey = consume({ route: "a", key: "other", limit: 1, windowMs: 60_000 });
    assert.equal(aSecond.ok, false);
    assert.equal(bFirst.ok, true);
    assert.equal(aOtherKey.ok, true);
  });
});

describe("ratelimit: applyHeaders", () => {
  it("sets the four standard headers", () => {
    _setClockForTest(() => 0);
    const v = consume({ route: "test", key: "k", limit: 5, windowMs: 60_000 });
    const headers = new Headers();
    applyHeaders(headers, v, 5);
    assert.equal(headers.get("X-RateLimit-Limit"), "5");
    assert.equal(headers.get("X-RateLimit-Remaining"), "4");
    assert.ok(headers.get("X-RateLimit-Reset"));
    assert.equal(headers.get("Retry-After"), null, "Retry-After only on 429");
  });

  it("sets Retry-After when ok=false", () => {
    _setClockForTest(() => 0);
    consume({ route: "x", key: "k", limit: 1, windowMs: 60_000 });
    const v = consume({ route: "x", key: "k", limit: 1, windowMs: 60_000 });
    const headers = new Headers();
    applyHeaders(headers, v, 1);
    assert.ok(headers.get("Retry-After"));
  });
});

describe("ratelimit: ipFromHeaders", () => {
  it("reads x-forwarded-for first hop", () => {
    const h = new Headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    assert.equal(ipFromHeaders(h), "10.0.0.1");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "192.168.1.1" });
    assert.equal(ipFromHeaders(h), "192.168.1.1");
  });

  it("returns 0.0.0.0 sentinel when no IP header", () => {
    assert.equal(ipFromHeaders(new Headers()), "0.0.0.0");
  });
});
