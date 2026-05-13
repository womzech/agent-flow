# AGENTS.md — AgentFlow / 智造工坊

> 本文件是 coding agent 在本仓库工作时的契约。Claude Code 通过 `CLAUDE.md` 加载，Codex/Kimi/Copilot 直接读本文件。

## 仓库目的

AgentFlow 是「企业 AI Agent 定制实施服务」的顾问端工作台。读两份现金流报告（已嵌入 README）能理解为什么这个产品存在、要服务什么客户、要解决什么痛点。

## 必读

修改代码前按顺序读：

1. `README.md`
2. `docs/product-spec.md`
3. `docs/architecture.md`
4. `src/lib/schema.ts`（数据模型源头）
5. `src/lib/templates.ts`（模板库源头）

## 设计原则

- **以销售→设计→开发→交付四阶段组织**：每个 feature 必须明确归属哪个阶段。横跨阶段的工具（如 Project Workspace）要把四阶段串成单一时间线。
- **模板优先**：客户场景千变万化，但常见模式不多。每解决一个客户问题，先想能不能沉淀成模板。
- **依赖最小化**：除 Next.js / Tailwind / better-sqlite3 / Anthropic SDK / archiver 外不引入新 npm 包。需要新增依赖时先在 PR 里说明替代方案为什么不行。
- **数据库可见性**：所有数据放 SQLite 单文件 `data/agent-flow.db`，schema 用 TypeScript 集中维护。任何字段变更要更新 `src/lib/schema.ts` 顶部的 CHANGELOG 注释。
- **API 路由薄**：业务逻辑放 `src/lib/`，API 路由只做参数校验 + 转发 + 序列化。

## 与 agent-governance 的关系

本仓库使用 agent-governance 的 `.agent/` 目录约定来管理长任务：

- `.agent/tasks/*.yaml` — 任务卡
- `.agent/prompts/*.md` — 紧凑 prompt
- `.agent/state/*.json` — 运行时状态

但**不强制依赖 AGOS 脚本**。开发者可以纯手动维护这些文件，也可以从 `../agent-governance` 调用 `scripts/agos.py`。

## Claude Token 纪律

- 改一个 feature 时只读相关目录，不要全仓 grep。
- 不把整个 README 或 schema 文件粘到 prompt 里——用相对路径引用。
- 长任务每完成一个里程碑就写一行到 `.agent/state/<task>.json`，便于 compact 后恢复。

## 验证

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # next build
```

修改 schema 或 templates 后必须跑 `npm run seed -- --reset` 验证种子数据仍能写入。

## 提交规范

- 一个 commit 一件事，commit message 用动词起头，中文或英文都行。
- 不在 commit message 里加 emoji（除非用户明确要求）。
- 改了 schema 或路由要同步更新 `docs/architecture.md`。
