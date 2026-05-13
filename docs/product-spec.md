# AgentForge 产品规格

> 版本：v0.1 (MVP)
> 上一次更新：2026-05-13

## 1. 用户画像

**主要用户 P1**：AI Agent 独立顾问 / 1-3 人小团队。
- 有软件工程 + LLM 应用经验。
- 服务于年营收 500 万 - 5000 万元的中小企业（外贸、工程、电商、本地服务）。
- 目标是每月签 2-4 个定制项目（每单 3-10 万元）+ 维持 5-10 家月费客户。

**次要用户 P2（路线图后期）**：AI Agent 服务商创始人。要管理多个顾问，多个客户。

## 2. 用户旅程

```
潜在客户线索（朋友圈 / 闲鱼 / 知乎私信）
        ↓
   录入 Lead（行业、规模、初步痛点）
        ↓
  约免费需求电话 → 填诊断问卷
        ↓
  AI 生成《AI 工作流诊断报告》→ 分享链接给客户
        ↓
        ├─ 客户付费 5000-10000 元买诊断
        └─ 客户决定做试点项目
                ↓
        进入 Design 阶段：Blueprint 编辑器画工作流
                ↓
        进入 Development 阶段：从 Template Library 选模板，参数化
                ↓
        Bundle 成 zip，交付给客户
                ↓
        Maintenance：月费 1000-5000 元/月，提供工单 + 优化
```

## 3. 数据模型概览

详见 `src/lib/schema.ts`。九张表：

| 表 | 含义 | 关键字段 |
|---|---|---|
| `leads` | 销售线索 | name, company, industry, stage, source, pain_points, contact, created_at |
| `clients` | 成交客户（从 lead 转化） | name, company, industry, billing_email, ... |
| `diagnostics` | 诊断报告 | client_id, questionnaire_json, report_markdown, status, pricing_quote_cents |
| `projects` | 项目 | client_id, name, status, project_fee_cents, monthly_fee_cents, started_at |
| `blueprints` | 工作流蓝图 | project_id, name, spec_json |
| `templates` | 工作流模板（内置 + 自建） | slug, name, category, industry, complexity, est_days, price_range, body_json |
| `deliverables` | 交付物 | project_id, template_slug, params_json, bundle_path, delivered_at |
| `tickets` | 工单 | project_id, title, body, status, priority |
| `revenue_log` | 收入记录 | project_id, kind (project|monthly), amount_cents, paid_at |

## 4. 关键页面

### 4.1 Dashboard `/`

- 顶部 KPI 卡片：本月新增 leads、本月收入、活跃项目数、月度复投率
- Pipeline 漏斗（每个阶段的 lead 数量）
- 最近 7 天活动时间轴

### 4.2 Leads 看板 `/leads`

- Kanban 列：lead / contacted / diagnosing / quoted / piloting / retainer / lost
- 点击 lead 进入详情：编辑信息、添加备注、转换为客户

### 4.3 诊断报告 `/diagnostics/new` 与 `/diagnostics/[id]`

- New：分步问卷
  - Step 1：客户基本信息（行业、规模、年营收区间）
  - Step 2：高频重复工作流（最多 3 个，每个填名称 + 现状耗时 + 频次 + 参与人数）
  - Step 3：现有系统（CRM/ERP/Excel/微信群 等多选）
  - Step 4：预算意愿（一次性预算、月度预算）
- 生成后跳转 `/diagnostics/[id]`：
  - 渲染 Markdown 报告
  - 「分享链接」按钮（生成只读 token URL）
  - 「转项目」按钮

### 4.4 Blueprint 编辑器 `/blueprints/[id]`

- 左侧：节点库（trigger、ai-step、http-call、condition、output）
- 中间：画布（用 SVG + 拖拽，不依赖 React Flow 等重组件）
- 右侧：节点详情面板（编辑参数）
- 顶部：Save / Export YAML

### 4.5 Template Library `/templates`

- 网格视图：每张卡片显示模板 logo、名称、行业、复杂度、预计交付天数、推荐价格
- 点击进入详情：完整说明 + 输入 / 输出 / 适用场景

### 4.6 Project Workspace `/projects/[id]`

- Tab 切换：Overview / Diagnostic / Blueprint / Deliverables / Tickets / Revenue
- Overview 上半部分：客户名片 + 项目状态 + KPI（已收款、未收款、工单数）

### 4.7 Settings `/settings`

- Anthropic API key
- 默认模型（claude-sonnet-4-6 或其他）
- 顾问个人信息（用于诊断报告署名）

## 5. 模板库（v0.1 内置）

| Slug | 名称 | 行业 | 复杂度 | 预计天数 | 推荐价格 |
|---|---|---|---|---|---|
| lead-intake | 销售线索自动录入 | 通用 B2B | 简单 | 3 | ¥2,000 - ¥5,000 |
| inquiry-reply | 外贸询盘智能回复 | 外贸 / 玩具 | 中等 | 7 | ¥8,000 - ¥15,000 |
| quote-generator | 报价单一键生成 | 工程 / 外贸 | 中等 | 5 | ¥6,000 - ¥12,000 |
| doc-qa-bot | 企业知识库问答机器人 | 通用 | 中等 | 10 | ¥9,800 - ¥30,000 |
| excel-batch | Excel 智能批处理 | 财务 / 运营 | 简单 | 3 | ¥1,980 - ¥5,000 |
| customer-service | 客服问题自动分类与回复 | 电商 / 服务业 | 中等 | 7 | ¥6,000 - ¥12,000 |
| price-monitor | 工程材料价格监控 | 工程 / 制造 | 中等 | 7 | ¥8,000 - ¥18,000 |

每个模板包含：

- `description`：业务场景说明
- `inputs`：客户需提供的资料（如「3 个月历史询盘 Excel」）
- `outputs`：交付给客户的产物
- `python_template`：参数化的 Python 脚本骨架
- `n8n_template`：对应的 n8n 工作流 JSON 骨架
- `readme_template`：客户侧使用手册 Markdown 骨架
- `roi_calc`：ROI 计算公式（用于诊断报告引用）

## 6. AI 集成点

| 场景 | 模型 | 输入 | 输出 |
|---|---|---|---|
| 诊断报告生成 | claude-sonnet-4-6 | 问卷 JSON + 模板库摘要 | Markdown 诊断报告 |
| Blueprint 自动建议（v0.2+） | claude-sonnet-4-6 | 工作流描述 | 节点 JSON |
| README 自动撰写 | claude-haiku-4-5 | 项目元数据 + 模板内容 | 客户手册 Markdown |
| 工单优先级 / 摘要（v0.2+） | claude-haiku-4-5 | 工单原文 | priority + summary |

## 7. 非目标（v0.1 不做）

- 不做客户侧 Portal —— 客户侧只能看分享链接，不能登录
- 不做多用户 SaaS —— 单机部署，单顾问使用
- 不做工作流的实际执行 —— Bundler 产物给客户自己跑（n8n / Python）
- 不做支付集成 —— revenue_log 是手动记账
- 不做账号 / 鉴权 —— 假设单用户，在 NEXT_PUBLIC_AGENT_TOKEN 这一层做简单 token 校验

## 8. 后续迭代

见 README 的「路线图」一节。
