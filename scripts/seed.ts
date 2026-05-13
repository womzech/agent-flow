#!/usr/bin/env tsx
/**
 * Seed the AgentForge DB with realistic demo data so the UI is meaningful
 * on a fresh clone. Run via `npm run seed`. Pass `--reset` to nuke the DB first.
 */

import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../src/lib/db";
import {
  blueprintsRepo,
  clientsRepo,
  deliverablesRepo,
  diagnosticsRepo,
  leadsRepo,
  projectsRepo,
  revenueRepo,
  ticketsRepo,
} from "../src/lib/repo";
import { fallbackDiagnostic } from "../src/lib/anthropic";

const RESET = process.argv.includes("--reset");

function main() {
  const dbPath = process.env.AGENTFORGE_DB
    ? resolve(process.cwd(), process.env.AGENTFORGE_DB)
    : resolve(process.cwd(), "data/agentforge.db");

  if (RESET && existsSync(dbPath)) {
    unlinkSync(dbPath);
    console.log(`[seed] reset: removed ${dbPath}`);
  }

  // Force schema creation
  getDb();

  // Skip if already seeded
  const existing = leadsRepo.list();
  if (existing.length > 0) {
    console.log(`[seed] already has ${existing.length} leads, skipping. Pass --reset to start fresh.`);
    return;
  }

  // ---- Leads ----
  const lead1 = leadsRepo.create({
    name: "陈晓刚",
    company: "深圳越达玩具有限公司",
    industry: "玩具外贸",
    contact: "wechat: chenxg88 / chenxg@yueda.cn",
    source: "industry-group",
    stage: "diagnosing",
    pain_points: "业务员每天花 2-3 小时回复阿里国际站询盘，资料散在 Excel 和老员工脑子里，新人上手慢。",
    budget_note: "老板提过愿意花 1-3 万买个工具，但要求 ROI 清晰。",
    next_action: "约本周五电话深聊，做诊断问卷。",
  });

  const lead2 = leadsRepo.create({
    name: "刘倩",
    company: "上海简素咨询",
    industry: "管理咨询",
    contact: "lqian@jiansu.consulting",
    source: "referral",
    stage: "contacted",
    pain_points: "顾问团队内部知识库散在 200+ 份 PDF / Word 里，新顾问找资料要半天。",
    budget_note: "公司层面有数字化预算，但需要走 IT 部门审批。",
    next_action: "下周三 demo doc-qa-bot 模板。",
  });

  const lead3 = leadsRepo.create({
    name: "王浩",
    company: "杭州盛远机电安装",
    industry: "工程安装",
    contact: "tel: 138-1234-5678",
    source: "wechat",
    stage: "lead",
    pain_points: "投标报价靠 Excel，钢材价格波动报错过 2 次大单，损失 6 位数。",
    budget_note: "—",
    next_action: "先发 60 秒 demo 视频，等 3 天回访。",
  });

  leadsRepo.create({
    name: "张磊",
    company: "厦门优品外贸",
    industry: "礼品外贸",
    contact: "linkedin",
    source: "linkedin",
    stage: "quoted",
    pain_points: "RFQ 报价混乱，多人同时报价给同客户，价差很大。",
    budget_note: "已确认 8000-15000 元预算。",
    next_action: "已发报价单，等客户回复（3 天后跟进）。",
  });

  leadsRepo.create({
    name: "周丹",
    company: "成都和悦电商",
    industry: "电商代运营",
    contact: "weibo private",
    source: "xiaohongshu",
    stage: "lost",
    pain_points: "客服人力紧张，但试了几个工具都不靠谱。",
    budget_note: "—",
    next_action: "已流失：客户决定先招人。",
  });

  // ---- Clients (converted from leads) ----
  const client1 = clientsRepo.create({
    name: "陈晓刚",
    company: "深圳越达玩具有限公司",
    industry: "玩具外贸",
    size: "30 人 / 年营收约 4000 万",
    contact: "chenxg@yueda.cn / 138-8888-1234",
    billing_email: "finance@yueda.cn",
    notes: "决策快，对响应速度敏感，跟单员 5 人为主要使用者。",
  });
  leadsRepo.update(lead1.id, { client_id: client1.id });

  // ---- Diagnostic ----
  const diagQ = {
    company: { name: client1.company, industry: client1.industry, size: client1.size },
    workflows: [
      {
        name: "回复客户询盘（含图片型号识别）",
        currentMinutesPerOccurrence: 20,
        occurrencesPerMonth: 200,
        headcountInvolved: 5,
        currentTools: ["阿里国际站", "Excel 产品库", "微信群"],
        failureMode: "新人找不到老款产品的报价记录，老员工要被反复打扰",
      },
      {
        name: "整理周度新询盘清单",
        currentMinutesPerOccurrence: 90,
        occurrencesPerMonth: 4,
        headcountInvolved: 1,
        currentTools: ["Excel"],
        failureMode: "手动复制粘贴，偶尔漏录",
      },
    ],
    existingSystems: ["Excel", "阿里国际站", "微信工作群"],
    budget: { oneTimeCents: 5000000, monthlyCents: 200000, note: "可接受预付 50%" },
    goals: ["缩短询盘响应时间", "新业务员 2 周内能独立处理 80% 询盘"],
    riskTolerance: "medium" as const,
    decisionMaker: "陈晓刚（老板）",
  };

  const diag = diagnosticsRepo.create({
    lead_id: lead1.id,
    client_id: client1.id,
    title: "深圳越达玩具 · AI 询盘工作流诊断",
    questionnaire: diagQ,
  });

  const fb = fallbackDiagnostic(diagQ);
  diagnosticsRepo.update(diag.id, {
    report_markdown: fb.reportMarkdown,
    recommended_templates: fb.recommendedTemplates.length ? fb.recommendedTemplates : ["inquiry-reply", "lead-intake"],
    pricing_quote_cents: 4000000,
    monthly_quote_cents: 150000,
    status: "ready",
    generated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    model_used: "fallback (seed)",
  });
  diagnosticsRepo.ensureShareToken(diag.id);

  // ---- Project ----
  const project = projectsRepo.create({
    client_id: client1.id,
    diagnostic_id: diag.id,
    name: "越达玩具 · 询盘智能回复试点",
    status: "pilot",
    project_fee_cents: 4000000,
    monthly_fee_cents: 150000,
    notes: "试点范围：英语 + 中文回复；产品库覆盖近 12 个月在售款；先 1 个业务员试用 2 周。",
  });

  // ---- Blueprint ----
  blueprintsRepo.create({
    project_id: project.id,
    name: "询盘 → 回复草稿 v1",
    spec: {
      nodes: [
        { id: "n1", type: "trigger", label: "阿里 IM 转发 webhook", x: 80, y: 80 },
        { id: "n2", type: "ai", label: "Claude 提取询盘关键信息", x: 320, y: 80 },
        { id: "n3", type: "ai", label: "Claude 在产品 / 历史向量库匹配", x: 320, y: 220 },
        { id: "n4", type: "ai", label: "Claude 生成回复草稿（中/英）", x: 580, y: 150 },
        { id: "n5", type: "output", label: "推送到企业微信审稿群", x: 820, y: 150 },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n1", to: "n3" },
        { from: "n2", to: "n4" },
        { from: "n3", to: "n4" },
        { from: "n4", to: "n5" },
      ],
    },
  });

  // ---- Deliverable (stub, no real bundle yet) ----
  deliverablesRepo.create({
    project_id: project.id,
    template_slug: "inquiry-reply",
    params: {
      productCatalogPath: "./data/yueda-products",
      historyInquiriesPath: "./data/yueda-history",
      tone: "professional",
      languages: "en,zh",
    },
    notes: "首版：先支持英文 + 中文。",
  });

  // ---- Ticket ----
  ticketsRepo.create({
    project_id: project.id,
    title: "新增模糊匹配：客户写错型号也能找到候选产品",
    body: "业务员反馈：客户经常写型号缩写或错误拼写，希望模型能给出 top-3 候选产品供选择。",
    priority: "normal",
  });

  // ---- Revenue ----
  revenueRepo.add({
    client_id: client1.id,
    project_id: project.id,
    kind: "diagnostic",
    amount_cents: 1000000,
    memo: "诊断服务预付",
  });
  revenueRepo.add({
    client_id: client1.id,
    project_id: project.id,
    kind: "project",
    amount_cents: 2000000,
    memo: "试点项目首期 50%",
  });

  console.log("[seed] inserted demo data:");
  console.log(`  - leads: ${leadsRepo.list().length}`);
  console.log(`  - clients: ${clientsRepo.list().length}`);
  console.log(`  - diagnostics: ${diagnosticsRepo.list().length}`);
  console.log(`  - projects: ${projectsRepo.list().length}`);
  console.log(`  - deliverables: ${deliverablesRepo.list().length}`);
  console.log(`  - revenue rows: ${revenueRepo.list().length}`);
}

main();
