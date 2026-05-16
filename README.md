# AgentFlow · 智造工坊

[![CI](https://github.com/womzech/agent-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/womzech/agent-flow/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-0.5.1-blue)](./package.json)

> 面向 AI Agent 独立顾问 / 小型团队的「销售 → 设计 → 开发 → 交付」一体化工作台。
>
> 灵感来自《创业产品现金流评估研究报告》中**方向 G — 企业 AI Agent 定制实施服务**：中小企业愿意为「省一个员工」的具体工作流自动化付费 3 万 - 10 万元，但顾问端需要能 1-3 周交付、可复用、可标准化报价的工具链。AgentFlow 把这套打法变成可日用的软件。

## 为什么做这个

两份报告的结论高度一致：

- 最快现金流路径是**为中小企业做 AI 工作流定制**（项目费 3-10 万元，1-3 周交付）。
- 起步的钩子是**「AI 工作流诊断报告」**（5000-10000 元，3-5 天交付）。
- 长期不被「项目制陷阱」拖死的关键是**把每次交付沉淀为可复用模板**。
- 销售路径是 **demo 驱动**：一个能展示「改造前 vs 改造后」的视频或现场演示，胜过任何 PPT。

AgentFlow 围绕这四点，把顾问每天要做的事情结构化：

| 顾问的日常 | 没有 AgentFlow | 有了 AgentFlow |
|---|---|---|
| 线索进来 | 微信里散落 | 进入 Lead Pipeline，按阶段流转 |
| 跟客户做诊断 | Word 文档手写 | 在线问卷 → Claude 生成结构化诊断报告 |
| 给客户报价 | 凭经验拍脑袋 | 基于模板复杂度 + 工时 + ROI 估算 |
| 设计工作流 | 白板拍照存微信 | 在 Blueprint 编辑器里建模，生成规格文档 |
| 写代码交付 | 每次从头写 | 从 Template Library 选模板，参数化生成 |
| 月度维护 | 微信里催 | 工单系统 + 月费追踪 |

## 核心功能

### 1. 销售（Sales）

- **Lead Pipeline**：看板视图，6 个标准阶段（线索 → 已联系 → 诊断中 → 待报价 → 试点中 → 维护中）
- **AI 诊断报告生成器**：填写客户行业/痛点/工作流问卷，调用 Claude 生成完整诊断报告，可分享链接给客户
- **报价计算器**：基于模板复杂度、定制工时、SLA 自动估算项目费 + 月费

### 2. 设计（Design）

- **Workflow Blueprint 编辑器**：节点式建模（触发器 → 步骤 → 输出），保存为 JSON 规格
- **ROI 计算器**：根据「现状耗时 × 人均成本 × 频次」算出年度节省

### 3. 开发（Development）

- **Template Library**：内置 10 个开箱即用的行业模板（支持行业 / 复杂度 / 关键词筛选）：
  - 销售线索自动录入（lead-intake）
  - 外贸询盘智能回复（inquiry-reply）
  - 报价单一键生成（quote-generator）
  - 企业知识库问答机器人（doc-qa-bot）
  - Excel 智能批处理（excel-batch）
  - 客服问题自动分类与回复（customer-service）
  - 工程材料价格监控（price-monitor）
  - 员工入职流程自动化（hr-onboarding）
  - 银行流水多源对账（finance-reconciliation）
  - 多平台订单聚合分发（ecommerce-order-routing）
- 每个模板含：Python 实现 + n8n 工作流 JSON + 客户使用手册模板

### 4. 交付（Delivery）

- **Project Workspace**：把客户、诊断、蓝图、交付物、工单、月费记录关联在一起
- **Deliverable Bundler**：一键打包 Python 脚本 + n8n JSON + Markdown 手册的 zip
- **Maintenance Tickets**：客户反馈进入工单系统，按月对账
- **Delivery OS**（v0.5）：
  - 客户数据导入（CSV / Excel .xlsx 上传 → 字段推断 → 数据质量分析）
  - 方案包（SolutionPackage）：结构化的可售方案，含验收标准 + 报价模型
  - SOW（工作说明书）：范围确认、里程碑付款、Tokenized Portal 链接（`/portal/[token]`）
  - 客户 Portal 确认：客户通过 token 链接在线确认 SOW（无需登录账号）
  - 验收记录（AcceptanceRecord）：完整签收 + 已知限制 + 证据链接

## 技术栈

- **前端 + 后端**：Next.js 14 App Router + TypeScript
- **样式**：Tailwind CSS（不引入外部 UI 库，最小依赖）
- **数据库**：SQLite via `better-sqlite3`（零运维，单文件）
- **AI**：Anthropic Claude API（`@anthropic-ai/sdk`），默认 `claude-sonnet-4-6`
- **打包**：原生 Node `archiver`（交付包 zip）
- **Excel 解析**：`xlsx`（Delivery OS Excel 上传的明确例外；CSV-only 降低 UX，手写解析器不可靠，该例外不再扩大）

依赖刻意控制在个位数包，方便 fork 后改造。

## 快速开始

```bash
git clone git@github.com:womzech/agent-flow.git
cd agent-flow
npm install
cp .env.example .env.local
# 在 .env.local 至少填入 AGENTFLOW_PASSWORD（启用鉴权）
# 可选：ANTHROPIC_API_KEY（不配则诊断走本地占位模板）
npm run seed          # 初始化数据库 + 种子数据
npm run dev           # 启动 http://localhost:3000
```

启动后访问 `/login` 用密码登录。所有 `/(app)/*` 与 `/api/*` 路由都被中间件保护；
`/share/<token>`、`/portal/<token>` 与 `/api/health` 公开，便于把诊断报告分享给客户、SOW 发给客户确认、健康检查暴露给监控。

### 验证

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # node:test, 210 cases / 46 suites, 0 extra deps
npm run build       # production build, 55 routes + middleware
npm run doctor      # environment self-check (Node/.env/DB/migrations/port)
npm run backup      # hot SQLite backup → data/backups/agent-flow-*.db
npm run cleanup -- --dry   # preview retention cleanup (expired tokens, old sessions)
```

CI 配置见 `.github/workflows/ci.yml`，矩阵 Node 18/20。

## 目录结构

```
.
├── README.md                # 本文件
├── AGENTS.md                # agent 治理规则（与 ../agent-governance 联动）
├── .agent/                  # AGOS 风格的任务状态目录
│   ├── tasks/               # 任务卡 YAML
│   ├── prompts/             # 紧凑 prompt
│   └── state/               # 运行时状态
├── docs/
│   ├── product-spec.md      # 产品规格
│   └── sales-playbook.md    # 销售剧本（30 天获客方案）
├── src/
│   ├── app/                 # Next.js App Router 页面 + API 路由
│   ├── components/          # React 组件
│   └── lib/                 # 数据库、模板、AI 客户端、工具
├── scripts/
│   └── seed.ts              # 数据库种子脚本
└── data/                    # SQLite 文件（gitignored）
```

## 30 天落地剧本

详见 [docs/sales-playbook.md](docs/sales-playbook.md)。摘要：

| 周 | 动作 | KPI |
|---|---|---|
| W1 | 录 3 个 demo 视频 + 朋友圈 / 闲鱼 / 小红书发布 | 5 条免费诊断咨询 |
| W2 | 把第 1 个诊断转化成付费试点（5000-10000 元） | 收到第 1 笔款 |
| W3 | 交付试点 + 推第 2-3 个客户进试点 | 30000+ 元入账 |
| W4 | 把试点案例做成新 demo + 推月度维护合同 | 进入「现金流可持续」状态 |

## 路线图

- [x] **v0.1 MVP**：CRM-lite + 诊断生成 + Blueprint + Template + Bundler
- [x] **v0.2 企业级硬化**：
  - 单租户鉴权（HMAC 签名 cookie）+ 审计日志 + Schema migrations + Health endpoint
  - 58 个测试用例（基于 `node:test`，零新依赖）+ GitHub Actions CI
  - Clients CRUD + 列表搜索过滤 + 数据 CSV/JSON 导出 + 打印友好诊断版
  - 统一 API 错误形状 + Error/loading boundaries + 性能索引
- [x] **v0.3 多用户 + RBAC + 企业微信**：
  - 4 个内置角色 × 22 条权限 + PBKDF2 密码 + 签名 cookie 多用户 session
  - 企业微信自建应用：URL 验证 + 收消息 + 异步 LLM 回复 + 主动推送
  - 6 个 slash 命令 + Claude 中文意图路由
  - `/users` `/roles` `/wecom` 管理 UI + 全程审计
- [x] **v0.4 Security & Scale hardening**（详见 `docs/v0.4-hardening-design.md`）：
  - Token-bucket rate limiting：login / WeCom / AI generate / bundle / TOTP
  - Double-submit CSRF tokens；logout 改 POST-only
  - API tokens (PAT) — n8n / Zapier 集成；plaintext 仅显示一次
  - Account lockout + 服务端 session 撤销 + 登录历史 UI
  - 2FA TOTP (RFC 6238)，两步登录，5 分钟 pending cookie
  - SQLite FTS5 trigram 全局搜索（CJK 友好，按权限过滤）
  - 分页 utility + `/security` 总览页
- [x] **v0.5 Delivery OS**：
  - 客户数据导入（CSV / Excel）→ 字段推断 → 数据质量分析
  - 方案包（SolutionPackage）：可售方案结构，含验收标准 + 报价模型
  - SOW（工作说明书）：范围确认、里程碑付款
  - Tokenized 客户 Portal（`/portal/[token]`）：客户无需登录即可在线确认 SOW
  - 验收记录（AcceptanceRecord）：签收 + 已知限制 + 证据链接
  - 注：本 Portal 为 tokenized 单页确认，不是完整客户账号登录系统
- [x] **v0.5.1 市场对齐与生产化**（详见 [`docs/v0.6-improvement-backlog.md`](docs/v0.6-improvement-backlog.md) + [`docs/v0.6-sprint2-backlog.md`](docs/v0.6-sprint2-backlog.md)）：
  - **行业模板覆盖 +43%**：新增 hr-onboarding / finance-reconciliation / ecommerce-order-routing（共 10 个模板）+ `/templates` 行业/复杂度/关键词筛选
  - **Token 安全收紧**：share_token / portal_token 30 天 TTL + 顾问端可撤回（写审计）+ 访问统计 UI（schema v6）
  - **Anthropic SDK 生产化**：prompt caching（system + 模板目录）+ 指数回退重试 + 60s 超时
  - **AI 输出回归测试**：`tests/anthropic-eval.test.ts` 盯死诊断报告 8 章节 schema 不漂移
  - **运维基线**：`npm run doctor` 自检 / `npm run backup` 热备 / `npm run cleanup` 数据保留
  - **容器化**：Multi-stage Dockerfile + docker-compose.yml（详见 `docs/deploy-docker.md`）
  - **可观测性**：结构化 JSON 日志（`src/lib/log.ts`）
  - **模板成品化**：price-monitor / lead-intake 不再有 TODO 占位符
  - **全局搜索完整**：FTS5 索引扩展到 v0.5 实体（imports / packages / SOW / acceptance）
  - **中国 AI 合规起步**：客户数据 PII 检测（身份证/手机/邮箱/银行卡/护照）+ 算法备案号页脚占位（`AGENTFLOW_ALGORITHM_FILING`）
  - **按结果定价模型**：SolutionPackage 支持 OutcomePricing；`docs/sales-playbook.md` 附完整定价对照与"如何定义 1 次结果"清单
  - **demo 闭环**：`scripts/seed.ts` 现在产生完整 Delivery OS 链（import → package → SOW → acceptance）
- [ ] **v0.6 SaaS 化 + 完整客户账号 Portal**：客户可登录自助查看进度、提工单、付月费；多顾问工作区支持
- [ ] **v0.7 IM 接入扩展**：钉钉 / 飞书 / Lark 接入 + 多账号

## License

MIT
