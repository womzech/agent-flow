# Changelog

本仓库遵循 [Semantic Versioning](https://semver.org/) 与 [Keep a Changelog](https://keepachangelog.com/) 风格。

## v0.2.0 — 2026-05-13 · Enterprise Hardening

第二轮迭代：把 v0.1 MVP 提升到可上线给客户用的企业级标准。**新增 14 项**，**修复 0 项**（v0.1 没有上线就没有 bug 回归）。

### Security

- **Auth**（`src/lib/auth.ts` + `src/middleware.ts`）：基于 `AGENTFORGE_PASSWORD` 的 Edge-safe 单租户鉴权。HMAC-SHA256 签名 cookie，HTTP-only + Secure + SameSite=Lax，7 天有效期。错误密码 1.5s 延迟抵御暴力破解。`/share/*`、`/api/health`、`/login` 为公开路由。未设置密码即为「OPEN MODE」(仅开发用，`/api/health` 会标红警告)。
- **Audit log**（`src/lib/audit.ts` + `audit_log` 表）：每次诊断生成、交付物打包、CSV 导出、登录等关键事件 append-only 记录。`/audit` 提供 UI 查看，可按 entity/action 过滤。

### Reliability

- **Schema migrations**：`schema_migrations` 表记录每次升到的 schema 版本。新增索引 `idx_leads_stage` / `idx_audit_log_at` / `idx_projects_status` / `idx_tickets_proj_status` 等 9 个。
- **Health endpoint** `/api/health`：检查 DB / 迁移版本 / Anthropic key / Auth posture，返回 200 (ok) 或 503 (degraded)，含 `started_at` / `version` / `sha`。可对接 Uptime Robot / 阿里云监控。
- **Error & loading boundaries**：`(app)/error.tsx` + `(app)/loading.tsx` + `global-error.tsx`。任何路由错误现在有体面的错误页，不再白屏。
- **Consistent API error shape**：所有 API 返回 `{ error, code, fields? }` 结构，HTTP 状态码与含义一致（400 参数错 / 401 鉴权 / 404 不存在 / 422 校验失败 / 500 服务端）。

### Quality

- **测试套件**：基于 `node:test` + tsx，**58 个用例 / 11 个 suite**，0 个新依赖。覆盖 schema / repo / 校验 / 定价 / 模板 / 打包器 / 审计 / 鉴权 / 工具函数 / 健康检查。`npm test`。
- **CI**：`.github/workflows/ci.yml`，矩阵 Node 18/20，跑 typecheck + lint + test + build + seed。
- **Input validation**：`src/lib/validate.ts` 提供轻量 zod 风格校验（无依赖）。API 路由用之确保 400/422 输入早失败。

### UX

- **List search/filter**：`/leads?q=...&stage=...&source=...` 支持搜索 + 多维度过滤；点击列头切换 stage filter。
- **Clients CRUD**：新增 `/clients` 列表 + `/clients/new` + `/clients/[id]`，含累计收入 / 项目历史 / 信息编辑。
- **打印版诊断**：`/share/<token>/print` 提供 A4 友好黑底白字版，含顾问署名（姓名 / 职位 / 电话 / 邮箱来自 Settings 或 ENV）。客户直接 Cmd-P 转 PDF。
- **数据导出**：dashboard 一键下载 `leads.csv` / `projects.csv` / `revenue.csv`（UTF-8 BOM 兼容 Excel）+ 任一诊断的完整 JSON 快照。每次导出审计入库。
- **运维菜单**：sidebar 新增「运维 Ops → 审计日志 / Settings」分组。

### Internal

- `crypto` 全部走 `globalThis.crypto.subtle`（Edge-safe），测试通过 `tests/preamble.mjs` 注入 webcrypto polyfill。
- `clientsRepo.update()` 补齐（v0.1 漏写）。
- `leadsRepo.list()`、`clientsRepo.list()` 接受可选过滤参数。

## v0.1.0 — 2026-05-13 · MVP

第一次发布。详见 `git log v0.1.0` 与 README 中的 v0.1 描述：CRM-lite + AI 诊断报告 + 工作流蓝图 + 7 内置模板 + 项目工作区 + 报价计算器。
