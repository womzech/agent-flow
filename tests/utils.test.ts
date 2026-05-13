import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fmtCents, fmtDate, renderMarkdown, safeJsonParse, slugify } from "../src/lib/utils";

describe("utils", () => {
  it("fmtCents formats yuan", () => {
    assert.equal(fmtCents(0), "¥0");
    assert.equal(fmtCents(100000), "¥1,000");
    assert.equal(fmtCents(1234567), "¥12,345.67");
  });

  it("fmtDate handles null/empty", () => {
    assert.equal(fmtDate(null), "—");
    assert.equal(fmtDate(""), "—");
  });

  it("fmtDate trims to minutes", () => {
    assert.equal(fmtDate("2026-05-13 10:30:45"), "2026-05-13 10:30");
  });

  it("renderMarkdown renders headings", () => {
    const h = renderMarkdown("# Hello\n## Sub");
    assert.equal(h.includes("<h1>Hello</h1>"), true);
    assert.equal(h.includes("<h2>Sub</h2>"), true);
  });

  it("renderMarkdown renders bold and code", () => {
    const h = renderMarkdown("This is **bold** and `code`.");
    assert.equal(h.includes("<strong>bold</strong>"), true);
    assert.equal(h.includes("<code>code</code>"), true);
  });

  it("renderMarkdown renders lists", () => {
    const h = renderMarkdown("- a\n- b\n- c");
    assert.equal(h.includes("<ul>"), true);
    assert.equal(h.includes("<li>a</li>"), true);
  });

  it("renderMarkdown renders tables", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const h = renderMarkdown(md);
    assert.equal(h.includes("<table>"), true);
    assert.equal(h.includes("<th>A</th>"), true);
  });

  it("renderMarkdown escapes raw html", () => {
    const h = renderMarkdown("<script>alert(1)</script>");
    assert.equal(h.includes("&lt;script&gt;"), true);
    assert.equal(h.includes("<script>alert(1)</script>"), false);
  });

  it("safeJsonParse falls back", () => {
    assert.deepEqual(safeJsonParse('{"a":1}', {}), { a: 1 });
    assert.deepEqual(safeJsonParse("nope", { a: 0 }), { a: 0 });
    assert.deepEqual(safeJsonParse(null, []), []);
  });

  it("slugify cleans strings", () => {
    assert.equal(slugify("Hello World!"), "hello-world");
    assert.equal(slugify("中文 测试"), "中文-测试");
  });
});
