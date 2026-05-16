# AgentFlow 产品规格

> 版本：v0.5.1 (市场对齐与生产化)
> 上一次更新：2026-05-16

## 1. 用户画像

**主要用户 P1**：AI Agent 独立顾问 / 1-3 人小团队。
- 有软件工程 + LLM 应用经验。
- 服务于年营收 500 万 - 5000 万元的中小企业（外贸、工程、电商、本地服务）。
- 目标是每月签 2-4 个定制项目（每单 3-10 万元）+ 维持 5-10 家月费客户。

**次要用户 P2（路线图后期）**：AI Agent 服务商创始人。要管理多个顾问，多个客户。

## 2. 用户旅程

### 2.1 完整销售→交付旅程

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

### 2.2 Delivery OS 交付闭环旅程（v0.5）

```
客户上传历史数据（CSV / Excel）
        ↓
  /data-imports/new — 解析字段 + 数据质量分析
  （总行数、缺失率、SLA 违规、推荐模板）
        ↓
  /solution-packages — AI 辅助生成方案包
  （目标场景、问题陈述、自动化步骤、验收标准、报价模型）
        ↓
  /sow — 生成 SOW（工作说明书）
  （范围确认、里程碑付款、客户 portal token）
        ↓
  /portal/[token] — 客户在线确认 SOW（tokenized，无需登录）
        ↓
  /projects/[id]/acceptance — 验收记录
  （已接受功能、已知限制、证据链接、客户签收）
```

## 3. 数据模型概览

详见 `src/lib/schema.ts`（当前 `SCHEMA_VERSION = 6`）。按域分组：

### Sales（销售）

| 表 | 含义 | 关键字段 |
|---|---|---|
| `leads` | 销售线索 | name, company, industry, stage, source, pain_points, contact |
| `clients` | 成交客户（从 lead 转化） | name, company, industry, billing_email |
| `diagnostics` | 诊断报告 | client_id, questionnaire_json, report_markdown, status, share_token, token_expires_at, token_revoked_at, token_view_count, token_last_viewed_at |
| `revenue_log` | 收入记录 | project_id, kind (diagnostic\|project\|monthly\|other), amount_cents |

### Delivery（交付）

| 表 | 含义 | 关键字段 |
|---|---|---|
| `projects` | 项目 | client_id, name, status, project_fee_cents, monthly_fee_cents |
| `blueprints` | 工作流蓝图 | project_id, name, spec_json |
| `deliverables` | 交付物 | project_id, template_slug, params_json, bundle_path |
| `tickets` | 工单 | project_id, title, body, status, priority |

### Delivery OS（v0.5 新增）

| 表 | 含义 | 关键字段 |
|---|---|---|
| `business_data_imports` | 客户数据导入（CSV/Excel） | filename, original_columns, inferred_schema, row_count, data_quality_summary |
| `solution_packages` | 可售方案包 | name, target_scenario, problem_statement, acceptance_criteria, pricing_model |
| `statement_of_work` | SOW（工作说明书） | scope_included, scope_excluded, price_cents, payment_milestones, portal_token, token_expires_at, token_revoked_at, token_view_count, token_last_viewed_at |
| `acceptance_records` | 验收记录 | accepted_features, known_limitations, signoff_status, customer_confirmed_at |

### Security / RBAC（v0.3 – v0.4）

| 表 | 含义 | 关键字段 |
|---|---|---|
| `users` | 用户账号 | email, name, password_hash, role_id, totp_secret, totp_enabled |
| `roles` | 角色定义 | name, description, is_system |
| `permissions` | 权限条目 | action (read\|write), resource |
| `role_permissions` | 角色↔权限映射 | role_id, permission_id |
| `sessions` | 服务端 session（支持撤销） | user_id, jti, ip, revoked_at |
| `api_tokens` | PAT（Personal Access Token） | user_id, token_hash, token_prefix, name |
| `login_attempts` | 登录记录（账号锁定用） | email, ip, ok, at |

### Integration / Ops

| 表 | 含义 | 关键字段 |
|---|---|---|
| `templates` | 工作流模板（内置 + 自建） | slug, name, category, industry, complexity, body_json |
| `settings` | 系统配置 k/v | key, value |
| `audit_log` | 审计日志 | actor, action, entity, entity_id, payload_json |
| `schema_migrations` | Schema 版本追踪 | version, applied_at |

> **搜索索引**：FTS5 虚拟表 `search_index`（trigram tokenizer）在进程内懒初始化，
> 自 v0.5.1 起覆盖 8 类实体：leads / clients / diagnostics / projects 以及 Delivery OS 的
> business_data_imports / solution_packages / statement_of_work / acceptance_records。
> 结果按当前用户权限过滤：`read:clients` 可见 client + import；`read:projects` 可见
> project + package + sow + acceptance。

> **Schema v6 新增（2026-05-16）**：`diagnostics.share_token` 与 `statement_of_work.portal_token`
> 都加上了 `token_expires_at`（默认 30 天 TTL）、`token_revoked_at`、`token_view_count`、
> `token_last_viewed_at` 四列（通过 `applyAlterColumnMigrations()` 幂等 ALTER，
> 而非 SCHEMA_SQL）。顾问可在 `/diagnostics/[id]` 与 `/sow/[id]` 主动撤回外发链接，
> 撤回操作写入审计（`share.revoke` / `portal.revoke`）。

## 4. 关键页面

### 4.1 Dashboard `/`

- 顶部 KPI 卡片：本月新增 leads、本月收入、活跃项目数、月度复投率
- Pipeline 漏斗（每个阶段的 lead 数量）
- 最近 7 天活动时间轴

### 4.2 Leads 看板 `/leads`

- Kanban 列：lead / contacted / diagnosing / quoted / piloting / retainer / lost
- 点击 lead 进入详情：编辑信息、添加备注、转换为客户

### 4.3 诊断报告 `/diagnostics/new` 与 `/diagnostics/[id]`

- New：分步问卷（行业/规模/痛点/系统/预算）
- 生成后：渲染 Markdown 报告、「分享链接」按钮、「转项目」按钮

### 4.4 Blueprint 编辑器 `/blueprints/[id]`

- 左侧：节点库（trigger、ai-step、http-call、condition、output）
- 中间：画布（SVG + 拖拽，不依赖 React Flow 等重组件）
- 右侧：节点详情面板（编辑参数）

### 4.5 Template Library `/templates`

- 网格视图：每张卡片显示模板名称、行业、复杂度、预计交付天数、推荐价格
- 顶部 GET 表单筛选器：行业下拉 / 复杂度 select / 关键词搜索；URL 同步参数可分享
- 点击进入详情：完整说明 + 输入/输出/适用场景

### 4.6 Project Workspace `/projects/[id]`

- Tab 切换：Overview / Diagnostic / Blueprint / Deliverables / Tickets / Revenue / Delivery OS
- Delivery OS tab 展示项目关联的 import / package / SOW / acceptance

### 4.7 Delivery OS 页面（v0.5 / v0.5.1）

- `/data-imports/new`：上传 CSV 或 Excel，实时展示字段推断 + 数据质量报告
- `/data-imports/[id]`：详情页，含建议的方案模板；v0.5.1 起在顶部展示 **PII 检测** 红色横幅（身份证 / 手机 / 邮箱 / 银行卡 / 护照，含脱敏样例与 PIPL 提示）
- `/solution-packages/[id]`：方案包详情，含报价模型（支持可选 `OutcomePricing` 按结果定价档位）与验收标准
- `/sow/[id]`：SOW 详情，含里程碑付款 + （若有）按结果定价卡片 + portal token 状态 / 访问统计 / 撤回按钮
- `/portal/[token]`：**公开页**，客户通过 token 链接在线确认 SOW（无需登录账号）；token 过期 / 已撤回时返回"已失效"页
- `/projects/[id]/acceptance`：验收记录，客户签收后锁定

### 4.8 Security & Admin

- `/security`：账号安全总览（会话管理、2FA 状态、登录历史）
- `/security/2fa`：TOTP 二步验证设置
- `/security/sessions`：所有活跃 session，支持单条撤销
- `/users` / `/users/[id]`：多用户管理（owner 专属）
- `/roles`：角色权限矩阵查看
- `/audit`：审计日志（按实体/操作过滤，分页）
- `/api-tokens`：PAT 管理（生成 / 撤销，用于 n8n / Zapier）

### 4.9 Global Search `/search`

- FTS5 trigram 全文搜索，v0.5.1 起覆盖 8 类实体：lead / client / diagnostic / project / import / package / sow / acceptance
- 按当前用户权限过滤可见实体：`read:clients` → client+import；`read:projects` → project+package+sow+acceptance
- 结果带高亮片段，并按 kind 分组

### 4.10 Settings `/settings`

- Anthropic API key 配置
- 默认模型选择
- 顾问个人信息（用于诊断报告署名）

## 5. 模板库

| Slug | 名称 | 行业 | 复杂度 | 预计天数 | 推荐价格 |
|---|---|---|---|---|---|
| lead-intake | 销售线索自动录入 | 通用 B2B | 简单 | 3 | ¥2,000 - ¥5,000 |
| inquiry-reply | 外贸询盘智能回复 | 外贸 / 玩具 | 中等 | 7 | ¥8,000 - ¥15,000 |
| quote-generator | 报价单一键生成 | 工程 / 外贸 | 中等 | 5 | ¥6,000 - ¥12,000 |
| doc-qa-bot | 企业知识库问答机器人 | 通用 | 中等 | 10 | ¥9,800 - ¥30,000 |
| excel-batch | Excel 智能批处理 | 财务 / 运营 | 简单 | 3 | ¥1,980 - ¥5,000 |
| customer-service | 客服问题自动分类与回复 | 电商 / 服务业 | 中等 | 7 | ¥6,000 - ¥12,000 |
| price-monitor | 工程材料价格监控 | 工程 / 制造 | 中等 | 7 | ¥8,000 - ¥18,000 |
| hr-onboarding | 员工入职流程自动化 | 通用 | 中等 | 7 | ¥8,000 - ¥15,000 |
| finance-reconciliation | 银行流水多源对账 | 财务 / 电商 | 中等 | 7 | ¥6,000 - ¥12,000 |
| ecommerce-order-routing | 多平台订单聚合分发 | 电商 / 新零售 | 复杂 | 14 | ¥15,000 - ¥40,000 |

每个模板包含：`description` / `inputs` / `outputs` / `python_template` / `n8n_template` / `readme_template` / `roi_calc`。

> **报价模型扩展（v0.5.1）**：`SolutionPackage.pricing_model` 现支持可选的 `outcome: OutcomePricing` 字段（`definition` / `unit_price_cents` / `monthly_floor_cents` / `monthly_cap_cents` / `measurement_notes`），用于按结果计费的高频场景。SOW 自动在客户 portal 同步展示。详见 `docs/sales-playbook.md` "报价模型选择" 章节。

## 6. AI 集成点

| 场景 | 模型 | 输入 | 输出 |
|---|---|---|---|
| 诊断报告生成 | claude-sonnet-4-6 | 问卷 JSON + 模板库摘要 | Markdown 诊断报告 |
| Blueprint 自动建议 | claude-sonnet-4-6 | 工作流描述 | 节点 JSON |
| README 自动撰写 | claude-haiku-4-5 | 项目元数据 + 模板内容 | 客户手册 Markdown |
| 工单优先级 / 摘要 | claude-haiku-4-5 | 工单原文 | priority + summary |
| 企业微信意图路由 | claude-haiku-4-5 | 用户消息 | slash 命令 + 实体 JSON |
| 数据导入质量分析 | claude-sonnet-4-6（计划） | data_quality_summary | 自然语言分析建议（当前为规则引擎） |

## 7. 非目标（v0.5.1 当前不做）

- 不做完整客户账号登录 Portal — 当前 `/portal/[token]` 是 tokenized 单页确认，不是账号体系
- 不做多租户 SaaS — 单机部署，单顾问团队使用；无跨租户数据隔离
- 不做工作流的实际执行 — Bundler 产物给客户自己跑（n8n / Python）
- 不做支付集成 — `revenue_log` 是手动记账
- 不做 PII 自动脱敏 — v0.5.1 只做检测 + 提示，不自动修改客户上传的数据
- 不做电子签名 — `AcceptanceRecord.signoff_status` 是文本枚举，无 hash 链 / e-signature 法律效力

## 7.1 合规说明

- **算法备案号**：通过 `AGENTFLOW_ALGORITHM_FILING` 环境变量配置；设置后在 app 页脚 + `/share/[token]` + `/portal/[token]` 显示，符合《互联网信息服务算法推荐管理规定》"显著位置展示"要求。未配置时不渲染。
- **PIPL 最小化**：`/data-imports/[id]` 的 PII 红色横幅会在客户上传含个人信息字段（身份证 / 手机 / 邮箱 / 银行卡 / 护照）时告警，建议顾问在上传到云端 LLM 前脱敏。
- **数据出境**：默认调用 Anthropic API（境外）。敏感行业（医疗 / 金融 / 政企）应自行评估并接入本地模型 — v0.6 backlog 中规划"LLM gateway"模块支持 DeepSeek / 通义 / 智谱 / 本地 vLLM。

## 8. 后续迭代

见 README 的「路线图」一节（v0.6 SaaS 化 + 完整客户账号 Portal，v0.7 IM 接入扩展）。
