import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCSV } from "../src/lib/data-import";

describe("parseCSV: edge cases", () => {
  it("parses a simple comma-separated file", () => {
    const { headers, rows } = parseCSV("a,b,c\n1,2,3\n4,5,6\n");
    assert.deepEqual(headers, ["a", "b", "c"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].a, "1");
    assert.equal(rows[1].c, "6");
  });

  it("handles CRLF line endings (Windows Excel exports)", () => {
    const { headers, rows } = parseCSV("a,b\r\n1,2\r\n3,4\r\n");
    assert.deepEqual(headers, ["a", "b"]);
    assert.equal(rows.length, 2);
  });

  it("handles classic Mac CR line endings", () => {
    const { headers, rows } = parseCSV("a,b\r1,2\r3,4");
    assert.deepEqual(headers, ["a", "b"]);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].b, "4");
  });

  it("strips empty lines so trailing newlines do not create empty rows", () => {
    const { rows } = parseCSV("a,b\n1,2\n\n\n");
    assert.equal(rows.length, 1);
  });

  it("respects quoted fields containing commas", () => {
    const { rows } = parseCSV(`name,note\n"Alice","Hello, world"\n"Bob","Nope"\n`);
    assert.equal(rows[0].note, "Hello, world");
    assert.equal(rows[1].note, "Nope");
  });

  it("supports escaped double quotes inside quoted fields", () => {
    const { rows } = parseCSV(`q\n"He said ""hi"" then left"\n`);
    assert.equal(rows[0].q, `He said "hi" then left`);
  });

  it("fills missing trailing cells with empty strings, not undefined", () => {
    const { rows } = parseCSV("a,b,c\n1,2\n");
    assert.equal(rows[0].a, "1");
    assert.equal(rows[0].b, "2");
    assert.equal(rows[0].c, "");
  });

  it("returns empty arrays for empty input", () => {
    const { headers, rows } = parseCSV("");
    assert.deepEqual(headers, []);
    assert.deepEqual(rows, []);
  });

  it("returns headers-only when file has just a header row", () => {
    const { headers, rows } = parseCSV("a,b,c\n");
    assert.deepEqual(headers, ["a", "b", "c"]);
    assert.equal(rows.length, 0);
  });

  it("trims whitespace from cells", () => {
    const { rows } = parseCSV("a,b\n  1  ,  hi  ");
    assert.equal(rows[0].a, "1");
    assert.equal(rows[0].b, "hi");
  });
});
