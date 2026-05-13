# Changelog

本仓库遵循 [Semantic Versioning](https://semver.org/) 与 [Keep a Changelog](https://keepachangelog.com/) 风格。

## v0.3.0 — 2026-05-13 · Multi-user RBAC + 企业微信

第三轮迭代：从单租户单密码升级为多用户 + RBAC + 企业微信双向交互。设计文档：
`docs/wecom-rbac-design.md`。10 个原子 commit，每个独立可部署。

### Security & 权限

- **Schema v3**：新增 `users` / `roles` / `permissions` / `role_permissions` 表 + 9 个索引。22 条 `read|write × 11 resource` 权限被自动 seed。
- **4 个内置角色**：
  - `owner`：全部 22 条权限
  - `consultant`：业务实体读写 + audit 只读（17 条）
  - `sales`：线索读写 + 客户/诊断/项目只读 + 工单读写（8 条）
  - `viewer`：所有业务实体只读（9 条）
- **PBKDF2-SHA256** 密码哈希（100k iter，32B salt），通过 WebCrypto，无新依赖。
- **签名 cookie session** 升级为多用户：payload 含 `sub: user_id`，middleware 通过 `x-agentforge-user-id` header 向 RSC 透传。
- **三种登录方式**：
  - 邮箱 + 密码（主路径）
  - 留空邮箱 + `AGENTFORGE_PASSWORD`（兼容 v0.2 部署）
  - Bootstrap：首次启动若 `users` 为空且环境变量已设置，自动创建 `admin@local` / owner
- **`requirePermission(action, resource)`** 服务端 helper：throw `HttpError(403)`，被 `(app)/error.tsx` 渲染为友好的「没有权限」页面。
- **Sidebar 权限过滤**：菜单项根据登录用户的权限集动态隐藏。
- **审计日志扩展**：所有 `user.*` / `wecom.*` 操作都进 audit_log，actor 字段从 `consultant` 升级到具体用户邮箱。

### 企业微信集成（自建应用）

- **`src/lib/wecom/crypto.ts`**：纯函数实现回调加解密。
  - AES-256-CBC + PKCS7（块 32B，`setAutoPadding(false)` 手动去填）
  - AESKey = `base64(EncodingAESKey + "=")` → 32 字节
  - 明文 = `random(16) || msgLen(4 BE) || msg || receiveid`
  - 签名 = `sha1(sort([token, ts, nonce, encrypt]).join(""))`
  - 14 个测试用例覆盖编解码、签名、tamper-rejection
- **`src/lib/wecom/api.ts`**：access_token 内存缓存（7000s TTL + in-flight 互斥），`sendText` / `sendMarkdown` 调用 `/cgi-bin/message/send`。
- **`/api/wecom/callback`**：
  - **GET**：URL 验证（签名校验 + echostr 解密回显），用于自建应用首次配置
  - **POST**：解密 → 立即 ACK 空 body（满足 5 秒超时）→ `queueMicrotask` 后台调用 intent router 并通过主动推送回复
  - public 路由（middleware whitelist），通过 4-tuple 签名认证
- **意图路由（`src/lib/wecom/intent.ts`）**：
  - 6 个 slash 命令：`/help` `/me` `/pipeline` `/leads [stage]` `/projects` `/diag <kw>`
  - 中文自然语言走 Claude，给定用户角色 + 权限，让模型先返回 JSON intent 再分发
  - 未绑定 `wecom_userid` 的企微用户只能 `/help` 和 `/me`；权限不足友好拒绝
- **主动推送（`src/lib/wecom/notify.ts`）**：4 个事件类型
  - `lead.create` → 群通知 + 痛点摘要
  - `diagnostic.generate` → 报价 + 月费 + 分享链接提示
  - `deliverable.bundle` → 项目 / 客户 / 模板 / 大小
  - `revenue.add` → 金额 / 类型 / 客户 / 项目
  - 失败永远不阻塞主流程，全部走 audit `wecom.fail`

### 管理 UI

- **`/users`**：列表 + 状态 + 角色 + 最近登录
- **`/users/new`**：邮箱 + 密码 + 角色 + 可选 `wecom_userid`，校验邮箱/wecom 唯一性
- **`/users/[id]`**：编辑信息 + 重置密码 + 启用/停用 + 展示有效权限
- **`/roles`**：4 个内置角色 + 权限矩阵 + 每个角色的用户计数
- **`/wecom`**：配置状态 + 已绑定用户表 + 最近 100 条 WeCom 事件
- **Login 页**：双模式提示（多用户邮箱模式 / 兼容单密码模式）

### 测试

- **87 个用例 / 19 个 suite**（v0.2 的 58 个基础上 +29）。新增覆盖：
  - `wecom-crypto.test.ts` (14)：encrypt/decrypt 往返、签名稳定性、tamper rejection、CDATA 解析
  - `wecom-intent.test.ts` (7)：slash 命令、未绑定/权限不足拒绝、resolveSender 映射
  - `wecom-notify.test.ts` (2)：未配置时的优雅 no-op
  - `password.test.ts` (6)：PBKDF2 hash/verify、salt 差异、迭代次数记录、garbage-input
- 所有测试零新依赖，基于 node:test + tsx。

### 部署

新增 ENV 变量（详见 `.env.example`）：
- `AGENTFORGE_SESSION_SECRET`（可选；默认 = `AGENTFORGE_PASSWORD`）
- `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` / `WECOM_TOKEN` / `WECOM_AES_KEY`（全部缺失时 WeCom 优雅降级）
- `WECOM_DEFAULT_NOTIFY_USERS`

v0.2 → v0.3 升级：`AGENTFORGE_PASSWORD` 不变即可自动 bootstrap admin。

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
