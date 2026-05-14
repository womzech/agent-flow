# E2E 交付流程验证报告

> 验证日期：2026-05-14 · 场景：客服工单智能分类自动化

---

## 场景名称

**客服工单智能分类自动化** — Customer Service Ticket Classification Automation

## 业务背景

某电商企业客服团队 10 人，月均工单量约 300 张。现状：

- 工单分类依赖人工，耗时且分类不一致
- 47% 高优先级工单首次响应超过 4 小时 SLA
- 43% 工单缺少解决时长记录，无法复盘
- 43% 工单无客户满意度评分，质量管理盲区

本次验证通过上传 30 条历史工单数据，走完从数据导入到验收签署的完整闭环。

---

## 测试数据

**文件位置：** `tests/fixtures/customer-service-tickets.csv`

**格式：** CSV，UTF-8，30 数据行，9 列

| 列名 | 类型 | 说明 |
|------|------|------|
| ticket_id | id | 工单编号 T001-T030 |
| subject | text | 工单主题 |
| category | category | 工单分类（含缺失值） |
| priority | status | 优先级：高/中/低 |
| status | status | 工单状态：已解决/处理中/待处理 |
| response_time_hours | numeric | 首次响应时长（小时） |
| resolution_time_hours | numeric | 解决时长（小时，含空值） |
| agent_id | category | 处理客服 ID |
| customer_satisfaction | numeric | 满意度 1-5（含空值） |

**预期质量问题：**
- `resolution_time_hours` 缺失率 43%（13/30 行）
- `customer_satisfaction` 缺失率 43%（13/30 行）
- `response_time_hours` 47% 记录超过 4 小时 SLA
- `category` 有缺失值（3 行）

---

## 执行命令

```bash
# 运行 E2E 验证脚本（无需服务器，无需 API Key）
npm run e2e:delivery-flow

# 运行所有单元测试
npm test

# 类型检查
npm run typecheck

# 构建检查
npm run build
```

---

## 页面路径

| 页面 | URL | 说明 |
|------|-----|------|
| 数据导入（CSV粘贴） | `/data-imports/new` | 粘贴 CSV，点击"解析并分析质量" |
| 数据导入详情 | `/data-imports/[id]` | 质量报告、字段分析、推荐模板 |
| 方案包详情 | `/solution-packages/[id]` | 问题陈述、自动化步骤、定价 |
| SOW 详情 | `/sow/[id]` | 范围、排除、付款节点、客户门户链接 |
| 项目验收 | `/projects/[id]/acceptance` | 验收记录 + 签署表单 |
| 客户门户（公开） | `/portal/[token]` | 无需登录，客户专属查看页 |

---

## API 路径

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/data-imports` | POST | 上传 CSV 文本 → 返回 import 对象 |
| `/api/data-imports/[id]` | GET | 获取导入详情 |
| `/api/solution-packages` | POST | `{ data_import_id }` → 返回 package |
| `/api/sow` | POST | `{ solution_package_id }` → 返回 SOW |
| `/api/sow` | PATCH | `{ id, action: "approve" }` → 客户确认 |
| `/api/acceptance` | POST | 创建验收记录 |
| `/api/acceptance` | PATCH | `{ id, action: "sign" }` → 签署 |

---

## E2E 脚本执行结果

```
▶ Step 0: Load test fixture CSV
  ✓ Parsed 30 rows × 9 columns from customer-service-tickets.csv
  ✓ Columns: ticket_id, subject, category, priority, status,
             response_time_hours, resolution_time_hours, agent_id, customer_satisfaction

▶ Step 1: Create client + project
  ✓ Client #1: 示范电商科技有限公司
  ✓ Project #1: 客服工单智能分类自动化项目

▶ Step 2: Data quality analysis
  ✓ 30 rows · 9 columns · 11% missing
  ✓ Duplicate rows: 0
  Issues detected:
    - 字段「resolution_time_hours」缺失率 43%（13/30 行）
    - 字段「customer_satisfaction」缺失率 43%（13/30 行）
    - 字段「response_time_hours」有 14 条记录（47%）超出 4 小时 SLA
  SLA violations:
    - response_time_hours: 14 records (47%) exceed 4h
  Recommendations:
    → 字段「category」有缺失值，推荐引入 AI 自动分类模型补全
    → 存在 SLA 违规，推荐引入智能路由与优先级自动升级机制
    → 数值字段「resolution_time_hours、customer_satisfaction」有较多空值，推荐增加数据收集规范
  ✓ Suggested templates: [customer-service, excel-batch]

▶ Step 3: Persist BusinessDataImport to SQLite
  ✓ BusinessDataImport #1 → project #1
  ✓ Persisted summary verified (30 rows)

▶ Step 4: Generate SolutionPackage
  ✓ SolutionPackage #1: "客服问题自动分类与回复方案包"
  ✓ Template: customer-service
  ✓ Automation steps (7): Step 1: 训练 AI 分类模型，自动补全缺失分类字段 | Step 2: 部署智能路由规则...
  ✓ Pricing: ¥9,000 · 7 days

▶ Step 5: Generate Statement of Work
  ✓ SOW #1: ¥9,000 · 2 weeks
  ✓ Portal token: <uuid>
  ✓ Approval status: pending
    30% — 合同签署（首款） — ¥2,700
    40% — 方案 Demo 验收（中期款） — ¥3,600
    30% — 最终交付验收（尾款） — ¥2,700
  ✓ Portal URL: /portal/<uuid>

▶ Step 6: Simulate customer approval via portal
  ✓ SOW approved

▶ Step 7: AcceptanceRecord — create + sign
  ✓ AcceptanceRecord #1 created (pending)
  ✓ Signed at 2026-05-14 06:34:51

▶ Step 8: Verify all objects in SQLite
  ✓ business_data_imports
  ✓ solution_packages
  ✓ statement_of_work
  ✓ acceptance_records
  ✓ SOW portal_token lookup
  ✓ SOW approved
  ✓ Acceptance signed

✅ E2E validation PASSED — all objects persisted and verified
```

---

## 数据库记录摘要

| 表 | 记录 | 关键字段 |
|----|------|----------|
| `business_data_imports` | 1 行 | `row_count=30`, `data_quality_summary` JSON |
| `solution_packages` | 1 行 | `name="客服问题自动分类与回复方案包"`, `template_slug="customer-service"` |
| `statement_of_work` | 1 行 | `price_cents=900000`, `portal_token=<uuid>` |
| `acceptance_records` | 1 行 | `signoff_status="signed"`, `customer_confirmed_at=<ts>` |
| `audit_log` | 6 行 | `import.create`, `package.create`, `sow.create`, `sow.approve`, `acceptance.create`, `acceptance.sign` |

---

## 生成内容摘要

### 诊断发现
- **3 个问题**：resolution_time_hours 缺失率 43%、customer_satisfaction 缺失率 43%、response_time_hours 47% 超 SLA
- **1 个 SLA 违规**：首次响应 14/30 条超出 4 小时阈值
- **3 条建议**：AI 分类补全、智能路由、数据收集规范

### 方案包
- **名称**：客服问题自动分类与回复方案包
- **基础模板**：customer-service
- **自动化步骤（7步）**：AI 分类模型训练 → 智能路由部署 → SLA 告警配置 → ...
- **参考报价**：¥9,000（区间 ¥6,000-12,000）

### SOW
- **总价**：¥9,000
- **周期**：2 周
- **付款节点**：30%/40%/30% 三段
- **交付物**：AI 分类模型 Python 脚本、n8n 工作流、客户操作手册

### 验收记录
- **签署状态**：已签署
- **已验收功能**：基于 acceptance_criteria（前 3 条）
- **已知限制**：首批模型需 ≥500 条标注数据微调；暂不支持英文混合工单
- **不含事项**：客服系统 UI 改造；第三方平台账号费用

---

## 验证结果汇总

| 检查项 | 结果 |
|--------|------|
| typecheck | ✅ 通过 |
| lint | ✅ 无警告 |
| 单元测试 | ✅ 166/166 通过 |
| build | ✅ 33 个路由正常编译 |
| E2E 脚本 | ✅ 7/7 持久化验证通过 |
| 无 API Key 运行 | ✅ 全程无需 Anthropic Key |

---

## 已知限制

1. **CSV only**：当前仅支持 CSV 粘贴，不支持 Excel 文件直接上传（接口已预留 source_type 扩展字段）
2. **规则驱动 SOW**：报价和范围由规则生成，未使用 LLM 增强（可后续叠加）
3. **客户门户无交互**：客户只能查看，不能在门户内直接提交确认（当前需通过顾问侧操作）
4. **FTS5 未扩展**：新实体（import/package/SOW）未加入全文搜索索引
5. **项目工作区未集成**：新实体在 `/projects/[id]` 主页面暂未展示，需通过独立链接访问

---

## 下一步建议

1. 在 `/projects/[id]` 增加"交付 OS"标签页，整合 import/package/SOW/acceptance 视图
2. 客户门户增加"我确认"按钮，直接调用 `/api/sow PATCH approve`
3. 实现 Excel 文件上传（引入 `xlsx` 库，<10KB gzip）
4. 将数据质量摘要注入 Claude 诊断提示词，实现 LLM 增强诊断
5. 将新实体加入 FTS5 搜索索引
