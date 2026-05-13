# AgentForge · 智造工坊

> 面向 AI Agent 独立顾问 / 小型团队的「销售 → 设计 → 开发 → 交付」一体化工作台。
>
> 灵感来自《创业产品现金流评估研究报告》中**方向 G — 企业 AI Agent 定制实施服务**：中小企业愿意为「省一个员工」的具体工作流自动化付费 3 万 - 10 万元，但顾问端需要能 1-3 周交付、可复用、可标准化报价的工具链。AgentForge 把这套打法变成可日用的软件。

## 为什么做这个

两份报告的结论高度一致：

- 最快现金流路径是**为中小企业做 AI 工作流定制**（项目费 3-10 万元，1-3 周交付）。
- 起步的钩子是**「AI 工作流诊断报告」**（5000-10000 元，3-5 天交付）。
- 长期不被「项目制陷阱」拖死的关键是**把每次交付沉淀为可复用模板**。
- 销售路径是 **demo 驱动**：一个能展示「改造前 vs 改造后」的视频或现场演示，胜过任何 PPT。

AgentForge 围绕这四点，把顾问每天要做的事情结构化：

| 顾问的日常 | 没有 AgentForge | 有了 AgentForge |
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

- **Template Library**：内置 7 个开箱即用的行业模板：
  - 销售线索自动录入（lead-intake）
  - 外贸询盘智能回复（inquiry-reply）
  - 报价单一键生成（quote-generator）
  - 企业知识库问答机器人（doc-qa-bot）
  - Excel 智能批处理（excel-batch）
  - 客服问题自动分类与回复（customer-service）
  - 工程材料价格监控（price-monitor）
- 每个模板含：Python 实现 + n8n 工作流 JSON + 客户使用手册模板

### 4. 交付（Delivery）

- **Project Workspace**：把客户、诊断、蓝图、交付物、工单、月费记录关联在一起
- **Deliverable Bundler**：一键打包 Python 脚本 + n8n JSON + Markdown 手册的 zip
- **Maintenance Tickets**：客户反馈进入工单系统，按月对账

## 技术栈

- **前端 + 后端**：Next.js 14 App Router + TypeScript
- **样式**：Tailwind CSS（不引入外部 UI 库，最小依赖）
- **数据库**：SQLite via `better-sqlite3`（零运维，单文件）
- **AI**：Anthropic Claude API（`@anthropic-ai/sdk`），默认 `claude-sonnet-4-6`
- **打包**：原生 Node `archiver`（交付包 zip）

依赖刻意控制在个位数包，方便 fork 后改造。

## 快速开始

```bash
git clone git@github.com:womzech/cash-flow.git agentforge
cd agentforge
npm install
cp .env.example .env.local
# 在 .env.local 填入 ANTHROPIC_API_KEY
npm run seed          # 初始化数据库 + 种子数据
npm run dev           # 启动 http://localhost:3000
```

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

- [x] **MVP（当前 repo）**：CRM-lite + 诊断生成 + Blueprint + Template + Bundler
- [ ] **v0.2**：把模板的 Python 脚本变成可在浏览器试运行的沙箱
- [ ] **v0.3**：接入企业微信 / 钉钉 / 飞书的 OAuth + 机器人，把模板直接推送到客户工作台
- [ ] **v0.4**：客户侧 Portal（客户可看进度、提工单、付月费）
- [ ] **v0.5**：多账号 SaaS 化（一个顾问可服务 N 家客户）

## License

MIT
