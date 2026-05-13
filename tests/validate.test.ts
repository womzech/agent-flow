import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../src/lib/validate";

describe("validate", () => {
  it("accepts valid input", () => {
    const r = validate<{ name: string; n: number }>(
      { name: "Hello", n: "42" },
      { name: { type: "string", required: true }, n: { type: "int", min: 0 } },
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, "Hello");
      assert.equal(r.value.n, 42);
    }
  });

  it("flags missing required field", () => {
    const r = validate({ }, { name: { type: "string", required: true } });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.fields.name, "必填");
      assert.equal(r.error.status, 422);
    }
  });

  it("flags out-of-range int", () => {
    const r = validate({ n: "-5" }, { n: { type: "int", min: 0 } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.fields.n.includes("不小于"), true);
  });

  it("supports enum", () => {
    const r = validate(
      { stage: "lead" },
      { stage: { type: "enum", values: ["lead", "contacted"] as const } },
    );
    assert.equal(r.ok, true);
    const bad = validate(
      { stage: "xx" },
      { stage: { type: "enum", values: ["lead", "contacted"] as const } },
    );
    assert.equal(bad.ok, false);
  });

  it("applies default when not required", () => {
    const r = validate(
      { },
      { stage: { type: "string", default: "lead" } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal((r.value as { stage: string }).stage, "lead");
  });

  it("parses JSON field", () => {
    const r = validate(
      { spec: '{"a":1}' },
      { spec: { type: "json", required: true } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual((r.value as { spec: { a: number } }).spec, { a: 1 });
  });

  it("flags bad JSON", () => {
    const r = validate(
      { spec: "not json" },
      { spec: { type: "json", required: true } },
    );
    assert.equal(r.ok, false);
  });

  it("works with FormData", () => {
    const fd = new FormData();
    fd.set("name", "FormVal");
    fd.set("n", "10");
    const r = validate<{ name: string; n: number }>(
      fd,
      { name: { type: "string", required: true }, n: { type: "int" } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.name, "FormVal");
  });
});
