# Product Delivery OS — 审计与升级计划

> 版本：v0.5.0 升级规划 · 审计日期：2026-05-14

---

## 一、当前系统能力地图

| 能力 | 状态 | 说明 |
|------|------|------|
| 线索 Pipeline（看板） | ✅ 已完成 | 6 阶段看板 + CSV 导出 |
| AI 诊断报告生成 | ✅ 已完成 | Claude + 无 Key fallback |
| 报价计算器 | ✅ 已完成 | 模板中点价格 + 自定义工时 |
| 工作流蓝图编辑器 | ✅ 已完成 | SVG 节点拖拽 + spec_json 持久化 |
| ROI 计算器 | ✅ 已完成 | 嵌入报价页 |
| 行业模板库（7个） | ✅ 已完成 | Python + n8n JSON + README 三件套 |
| ZIP 交付包下载 | ✅ 已完成 | archiver 打包 + 速率限制 |
| 项目工作区 | ✅ 已完成 | 多 Tab：信息/蓝图/交付物/工单/收款 |
| RBAC / 权限（4角色22权限） | ✅ 已完成 | owner/consultant/sales/viewer |
| 2FA TOTP | ✅ 已完成 | RFC 6238 |
| CSRF 保护 | ✅ 已完成 | Double-submit cookie |
| 速率限制 | ✅ 已完成 | Token bucket，6 个端点 |
| 审计日志 | ✅ 已完成 | append-only，22 种事件 |
| API Tokens (PAT) | ✅ 已完成 | SHA-256 存储，Bearer 认证 |
| 企业微信双向消息 | ✅ 已完成 | 6 个斜杠命令 + Claude intent routing |
| SQLite FTS5 CJK 搜索 | ✅ 已完成 | trigram tokenizer |
| Excel / CSV 数据接入 | ✅ **本轮新增** | CSV 粘贴 + 质量分析（Excel 扩展预留） |
| 价格监控数据源 | 🔶 占位/TODO | templates.ts 中有 TODO 注释，未实现真实数据源 |
| 价格告警持久化 | 🔶 占位/TODO | templates.ts 中有 TODO 注释 |
| SolutionPackage 抽象 | ✅ **本轮新增** | 完整 CRUD + 从数据导入自动生成 |
| 报价/SOW 生成 | ✅ **本轮新增** | 规则驱动 + 三段付款节点 |
| 客户门户（tokenized） | ✅ **本轮新增** | `/portal/[token]` 公开页 |
| 验收记录 | ✅ **本轮新增** | AcceptanceRecord + 签署状态 |
| SaaS 多租户 | ❌ 缺失 | 计划 v0.6 |
| 钉钉 / 飞书集成 | ❌ 缺失 | 计划 v0.6 |

---

## 二、当前系统主要缺口（本轮升级前）

1. **数据接入缺口**：诊断报告基于问卷填写，不能基于真实业务数据（CSV/Excel）。客户上传历史数据后系统无法自动分析。
2. **方案包缺口**：7 个模板仅是"文件包"，缺少可销售/可交付/可验收的概念抽象。无法将问题→方案→报价→验收串联。
3. **SOW 缺口**：报价计算器只输出数字，无法生成包含范围/假设/里程碑的正式工作说明书。
4. **客户侧缺口**：客户只能通过诊断分享链接查看报告，无法查看项目状态、报价、待确认事项、验收状态。
5. **验收闭环缺口**：项目交付无结构化验收记录，无法追溯哪些功能被验收、哪些被排除。

---

## 三、当前架构风险

| 风险 | 级别 | 说明 |
|------|------|------|
| 单进程内存速率限制 | 低 | 多进程部署时限制失效；单实例足够 |
| SQLite 单文件 | 低 | 写并发有限；当前场景（单租户小团队）完全足够 |
| 模板 TODO 占位 | 中 | price-monitor / excel-batch 数据源未实现，演示时需注意 |
| 无自动化 CI | 中 | 无 GitHub Actions；依赖手动 `npm test` |
| FTS5 手动索引 | 低 | 新增实体未自动入索引；需手动调 `indexEntity` |

---

## 四、推荐产品定位

**agent-flow = AI 自动化服务交付操作系统**

定位于 n8n/Dify/Zapier 的上层管理层，不做执行引擎，而做：
- 客户业务数据接入与质量诊断
- 自动化方案包设计与销售
- 报价/SOW 生成与客户确认
- 项目交付全程管理
- 验收闭环与运维续费

目标用户：AI 自动化服务商、数字化顾问、小型交付团队（1-20人）。

---

## 五、本轮升级范围（v0.5.0）

### 新增领域对象

| 对象 | 表名 | 核心功能 |
|------|------|----------|
| BusinessDataImport | `business_data_imports` | CSV 解析 + 质量分析 + schema 推断 |
| SolutionPackage | `solution_packages` | 方案包 CRUD + 从导入自动生成 |
| StatementOfWork | `statement_of_work` | SOW 生成 + portal_token + 客户确认 |
| AcceptanceRecord | `acceptance_records` | 验收记录 + 签署状态 |

### 新增页面

| 路由 | 类型 | 说明 |
|------|------|------|
| `/data-imports/new` | Client | CSV 粘贴上传 |
| `/data-imports/[id]` | Server | 质量报告、字段分析、推荐模板 |
| `/solution-packages/[id]` | Server | 方案包详情 |
| `/sow/[id]` | Server | SOW 详情 + 客户门户链接 |
| `/projects/[id]/acceptance` | Server | 验收记录管理 |
| `/portal/[token]` | Server（公开） | 客户门户 |

### 新增 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/data-imports` | POST | 上传并解析 CSV |
| `/api/data-imports/[id]` | GET | 获取导入详情 |
| `/api/solution-packages` | POST | 从导入生成方案包 |
| `/api/sow` | POST/PATCH | 生成/审批 SOW |
| `/api/acceptance` | POST/PATCH | 创建/签署验收记录 |

---

## 六、明确不做的事项（本轮）

- **不做** SaaS 多租户（数据库隔离、账单系统）
- **不做** 钉钉 / 飞书集成
- **不做** Excel 文件直接上传（支持 CSV，Excel 扩展预留接口）
- **不做** 客户侧独立账号体系（使用 tokenized 链接代替）
- **不做** LLM 增强的 SOW 生成（规则驱动已足够演示；LLM 可后续叠加）
- **不做** 重构现有功能（零破坏性改动）

---

## 七、端到端验证场景

### 选定场景：客服工单智能分类自动化

**选择理由：**
1. repo 中已有 `customer-service` 模板，无需从零开发
2. 数据结构清晰（ticket_id/category/priority/response_time 等）
3. SLA 违规分析有直接商业价值（成本可量化）
4. 无合规风险（不像 price-monitor 需要数据源授权）
5. 在 30 行 CSV 内即可演示完整分析逻辑

**业务背景：** 电商客服团队 10 人，每月约 300 张工单，人工分类耗时，SLA 超标率高，客户满意度数据缺失。

---

## 八、数据模型改动

### Schema 变更（v4 → v5）

新增 4 张表，均使用 `CREATE TABLE IF NOT EXISTS`（幂等，存量 DB 安全）：

```sql
business_data_imports (id, project_id, client_id, source_type, filename,
  original_columns, inferred_schema, row_count, sample_rows,
  data_quality_summary, created_at)

solution_packages (id, project_id, name, target_scenario, problem_statement,
  required_inputs, workflow_blueprint_id, recommended_automation_steps,
  delivery_artifacts, pricing_model, acceptance_criteria, maintenance_plan,
  version, template_slug, data_import_id, created_at, updated_at)

statement_of_work (id, project_id, solution_package_id, scope_included,
  scope_excluded, assumptions, deliverables, timeline_weeks, price_cents,
  payment_milestones, customer_approval_status, portal_token,
  created_at, updated_at)

acceptance_records (id, project_id, solution_package_id, accepted_features,
  known_limitations, excluded_items, evidence_links, customer_confirmed_at,
  signoff_status, created_at, updated_at)
```

---

## 九、验收标准

- [x] `npm run typecheck` 无错误
- [x] `npm run lint` 无警告/错误
- [x] `npm run test` 全部 166 个测试通过（含新增 16 个）
- [x] `npm run build` 成功，33 个页面正常编译
- [x] `npm run e2e:delivery-flow` 全部 7 项持久化验证通过
- [x] 客户门户 `/portal/[token]` 为公开路由（无需登录）
- [x] 无 Anthropic API Key 时 E2E 仍可完整运行
- [x] 所有核心功能未被破坏（原 150 个测试全部通过）

---

## 十、下一轮优先事项（v0.6）

1. **真实 Excel 上传**：支持 .xlsx 文件（推荐引入 `xlsx` 轻量库）
2. **LLM 增强诊断**：将数据质量摘要注入 Claude 提示词，生成更深入的业务洞察
3. **项目工作区整合**：在 `/projects/[id]` 标签页中直接展示关联的 import/package/SOW/acceptance
4. **FTS5 搜索集成**：将新实体加入全文搜索索引
5. **价格监控 TODO 实现**：将 templates.ts 中的占位数据源替换为真实 CSV 导入驱动
6. **钉钉/飞书通知**：复用现有 WeCom notify 架构扩展
