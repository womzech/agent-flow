import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pageHref, pageMeta, parsePagination } from "../src/lib/pagination";

describe("parsePagination", () => {
  it("returns sensible defaults", () => {
    const p = parsePagination({});
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 25);
    assert.equal(p.offset, 0);
  });

  it("accepts string values from URLSearchParams", () => {
    const usp = new URLSearchParams("page=3&pageSize=10");
    const p = parsePagination(usp);
    assert.equal(p.page, 3);
    assert.equal(p.pageSize, 10);
    assert.equal(p.offset, 20);
  });

  it("clamps page ≥ 1", () => {
    assert.equal(parsePagination({ page: -5 }).page, 1);
    assert.equal(parsePagination({ page: 0 }).page, 1);
  });

  it("clamps pageSize between 1 and 200", () => {
    assert.equal(parsePagination({ pageSize: 0 }).pageSize, 1);
    assert.equal(parsePagination({ pageSize: 9999 }).pageSize, 200);
  });

  it("rejects NaN with default fallback", () => {
    const p = parsePagination({ page: "abc", pageSize: "xyz" });
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 25);
  });
});

describe("pageMeta", () => {
  it("computes totalPages and prev/next flags", () => {
    const m = pageMeta({ page: 2, pageSize: 10, limit: 10, offset: 10 }, 25);
    assert.equal(m.totalPages, 3);
    assert.equal(m.hasPrev, true);
    assert.equal(m.hasNext, true);
  });

  it("totalPages = 1 when no rows", () => {
    const m = pageMeta({ page: 1, pageSize: 25, limit: 25, offset: 0 }, 0);
    assert.equal(m.totalPages, 1);
    assert.equal(m.hasPrev, false);
    assert.equal(m.hasNext, false);
  });

  it("hasNext=false on last page", () => {
    const m = pageMeta({ page: 3, pageSize: 10, limit: 10, offset: 20 }, 25);
    assert.equal(m.hasNext, false);
  });
});

describe("pageHref", () => {
  it("preserves existing params and overrides page", () => {
    const href = pageHref("/leads", { q: "玩具", stage: "diagnosing", page: "1" }, 2);
    assert.ok(href.startsWith("/leads?"));
    const u = new URL("http://x" + href);
    assert.equal(u.searchParams.get("q"), "玩具");
    assert.equal(u.searchParams.get("stage"), "diagnosing");
    assert.equal(u.searchParams.get("page"), "2");
  });

  it("drops undefined values", () => {
    const href = pageHref("/leads", { q: undefined, stage: "lead" }, 5);
    const u = new URL("http://x" + href);
    assert.equal(u.searchParams.get("q"), null);
    assert.equal(u.searchParams.get("stage"), "lead");
  });
});
