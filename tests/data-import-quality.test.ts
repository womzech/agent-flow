import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuality, detectPii, parseCSV, PII_LABELS } from "../src/lib/data-import";

describe("analyzeQuality: missing/duplicate/SLA", () => {
  it("computes missing cell counts + percentages", () => {
    const { headers, rows } = parseCSV("a,b\n1,2\n3,\n,5\n");
    const q = analyzeQuality(headers, rows);
    assert.equal(q.totalRows, 3);
    assert.equal(q.totalColumns, 2);
    assert.equal(q.missingCellsTotal, 2);
    assert.equal(q.missingCellsPct, Math.round((2 / 6) * 100));
  });

  it("flags duplicate rows", () => {
    const { headers, rows } = parseCSV("a,b\n1,2\n1,2\n3,4\n");
    const q = analyzeQuality(headers, rows);
    assert.equal(q.duplicateRows, 1);
  });

  it("emits piiFlags=[] when no PII present", () => {
    const { headers, rows } = parseCSV("order_id,total\n1,99\n2,199\n");
    const q = analyzeQuality(headers, rows);
    assert.deepEqual(q.piiFlags, []);
  });

  it("derives suggestedTemplates from column shape", () => {
    const { headers, rows } = parseCSV("ticket_id,subject,category\nT1,问题1,技术\nT2,问题2,售后\n");
    const q = analyzeQuality(headers, rows);
    assert.ok(Array.isArray(q.suggestedTemplates));
  });
});

describe("detectPii", () => {
  it("flags Chinese mobile numbers", () => {
    const { headers, rows } = parseCSV("name,phone\nAlice,13812345678\nBob,15998765432\n");
    const flags = detectPii(headers, rows);
    const phoneFlag = flags.find((f) => f.kind === "phone_cn");
    assert.ok(phoneFlag, "expected phone_cn flag");
    assert.equal(phoneFlag!.matchCount, 2);
    assert.equal(phoneFlag!.column, "phone");
    assert.ok(phoneFlag!.redactedSamples[0].includes("*"));
  });

  it("flags emails", () => {
    const { headers, rows } = parseCSV("user,email\nA,a@example.com\nB,b@example.com\nC,c@example.com\n");
    const flags = detectPii(headers, rows);
    const emailFlag = flags.find((f) => f.kind === "email");
    assert.ok(emailFlag);
    assert.equal(emailFlag!.matchCount, 3);
  });

  it("flags Chinese ID cards but not random numbers of the same length", () => {
    const csv =
      "name,id_card,random\n" +
      "Alice,11010120000101001X,99999999999999999X\n" +
      "Bob,440301198506060019,12345678901234567X\n";
    const { headers, rows } = parseCSV(csv);
    const flags = detectPii(headers, rows);
    assert.ok(flags.some((f) => f.kind === "id_card_cn" && f.column === "id_card"));
    assert.equal(flags.some((f) => f.column === "random"), false);
  });

  it("only flags bank-card-shaped numbers in columns whose name hints at bank/account", () => {
    const csv =
      "trx_id,bank_card_no\n" +
      "T1,6222021234567890123\n" +
      "T2,6217001234567890\n";
    const { headers, rows } = parseCSV(csv);
    const flags = detectPii(headers, rows);
    assert.ok(flags.some((f) => f.kind === "bank_card" && f.column === "bank_card_no"));
    // trx_id is also 13+ digit numeric but column name does not hint at money — must not flag.
    assert.equal(flags.some((f) => f.column === "trx_id"), false);
  });

  it("requires at least 2 matches in a column before flagging", () => {
    const { headers, rows } = parseCSV("note\nrandom\n13812345678\n");
    const flags = detectPii(headers, rows);
    assert.deepEqual(flags, []);
  });

  it("emits PII labels in Chinese for the UI", () => {
    assert.equal(PII_LABELS.id_card_cn, "身份证号");
    assert.equal(PII_LABELS.phone_cn, "手机号");
    assert.equal(PII_LABELS.email, "邮箱");
    assert.equal(PII_LABELS.bank_card, "银行卡 / 账户号");
    assert.equal(PII_LABELS.passport, "护照号");
  });

  it("redacts sample values so the UI never displays raw PII", () => {
    const { headers, rows } = parseCSV("phone\n13812345678\n15998765432\n");
    const flags = detectPii(headers, rows);
    const sample = flags[0].redactedSamples[0];
    assert.equal(sample.includes("*"), true);
    assert.equal(sample, "13*******78");
  });
});

describe("analyzeQuality + pii integration", () => {
  it("piiFlags surface as issues + add a recommendation", () => {
    const { headers, rows } = parseCSV("customer,phone,email\nAlice,13812345678,a@x.com\nBob,15998765432,b@x.com\n");
    const q = analyzeQuality(headers, rows);
    assert.ok(q.piiFlags.length >= 2);
    assert.ok(q.issues.some((i) => i.includes("PII") || i.includes("个人信息")));
    assert.ok(q.recommendations.some((r) => r.includes("脱敏") || r.includes("PIPL")));
  });
});
