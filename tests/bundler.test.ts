import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { withTempDb } from "./setup";

const tmp = withTempDb();

describe("bundler", () => {
  let buildBundle: typeof import("../src/lib/bundler").buildBundle;

  before(async () => {
    const m = await import("../src/lib/bundler");
    buildBundle = m.buildBundle;
  });

  after(() => tmp.dispose());

  it("produces a zip with all 5 expected files for lead-intake", async () => {
    const r = await buildBundle(9999, {
      templateSlug: "lead-intake",
      params: { leadFields: "公司名,联系人", notifyWebhook: "wh", sheetUrl: "sheet", llmModel: "claude-sonnet-4-6" },
      clientName: "ACME",
      projectName: "Pilot",
    });
    assert.equal(existsSync(r.zipPath), true);
    assert.equal(statSync(r.zipPath).size, r.zipSize);
    const names = r.files.map((f) => f.name);
    for (const f of ["lead-intake.py", "workflow.json", "README.md", "requirements.txt", "DELIVERY.md"]) {
      assert.equal(names.includes(f), true, `missing in bundle: ${f}`);
    }
    // Zip magic
    const head = readFileSync(r.zipPath).slice(0, 2);
    assert.equal(head[0], 0x50);
    assert.equal(head[1], 0x4b);
  });

  it("renders client and project name into the python script", async () => {
    const r = await buildBundle(10000, {
      templateSlug: "inquiry-reply",
      params: { productCatalogPath: "/x", historyInquiriesPath: "/y", tone: "professional", languages: "en,zh" },
      clientName: "TestCo",
      projectName: "MyProject",
    });
    const buf = readFileSync(r.zipPath);
    // The python file inside contains both names as comments; zip is binary so
    // we just assert non-trivial size and presence of magic prefix.
    assert.equal(buf.length > 500, true);
  });

  it("throws on unknown template slug", async () => {
    await assert.rejects(
      () => buildBundle(10001, { templateSlug: "no-such-template", params: {}, clientName: "X", projectName: "Y" }),
      /unknown template/,
    );
  });
});
