# Changelog

本仓库遵循 [Semantic Versioning](https://semver.org/) 与 [Keep a Changelog](https://keepachangelog.com/) 风格。

## v0.5.1 — 2026-05-16 · 市场对齐与生产化

复盘 v0.5 后做了一轮市场调研 + repo 全审计（产出 [`docs/v0.6-improvement-backlog.md`](docs/v0.6-improvement-backlog.md)，列出 62 项改进），首批交付 13 项。第二批本次再交付 13 项（详见 [`docs/v0.6-sprint2-backlog.md`](docs/v0.6-sprint2-backlog.md)）。

### 模板覆盖

- 模板库 7 → 10：新增 `hr-onboarding`（员工入职多系统开通）、`finance-reconciliation`（银行流水多源对账）、`ecommerce-order-routing`（多平台订单聚合分发）。
- `price-monitor` 与 `lead-intake` 不再有 TODO 占位符，可直接交付演示。

### 数据与 Token 安全

- Schema v6：share_token / portal_token 增加 `token_expires_at`（默认 30 天 TTL）、`token_revoked_at`、`token_view_count`、`token_last_viewed_at`（idempotent ALTER）。
- `/share/[token]` 与 `/portal/[token]` 在 token 过期 / 撤回时返回友好"已失效"页；每次访问递增计数。
- 顾问可在 `/diagnostics/[id]` 与 `/sow/[id]` 主动撤回外发链接，写入审计日志。
- 全局搜索 FTS5 索引扩展到 v0.5 实体（`solution_packages` / `statement_of_work` / `business_data_imports` / `acceptance_records`）。

### AI / Anthropic SDK

- 诊断生成启用 prompt caching（system + 模板目录走 ephemeral cache_control）。
- SDK 接入指数回退重试（5xx/429/timeout 重试 3 次），显式 60s 超时。
- usage 日志记录 `cache_read_input_tokens` / `cache_creation_input_tokens` / `input_tokens` / `output_tokens`。

### 合规与隐私（中国 AI 监管对齐）

- 客户上传 CSV/Excel 时自动检测 PII（身份证、手机、邮箱、银行卡）并在 `dataQualitySummary.piiFlags` 落档 + UI 红色横幅。
- 页脚与公开页支持「算法备案号」展示（读取 `AGENTFLOW_ALGORITHM_FILING` 环境变量）。
- SOW 模板新增「按结果定价（per-outcome）」字段；销售剧本附使用建议。

### 运维基线

- `npm run doctor` — Node / .env / DB / 迁移 / 端口自检（pre-deploy gate）。
- `npm run backup` — SQLite Online Backup API 热备到 `data/backups/`。
- `npm run cleanup -- --dry` — 清理过期 token、过期 login_attempts、过期 sessions（idempotent）。
- Multi-stage `Dockerfile` + `docker-compose.yml` + `.dockerignore`（详见 `docs/deploy-docker.md`）。
- 结构化 JSON logger（`src/lib/log.ts`），`AGENTFLOW_LOG_LEVEL` 可调。

### 体验

- `/templates` 增加行业 / 复杂度 / 关键词三种筛选（URL-synced query params）。
- 诊断 / SOW 详情页显示「访问 N 次 · 最近访问 时间」摘要。
- Sidebar 模板数量提示同步到 10。

### 测试覆盖

- 新增 `tests/csv.test.ts`、`tests/data-import-quality.test.ts`、`tests/search-coverage.test.ts`、`tests/anthropic-eval.test.ts`。
- 测试总数 169 → 210（v0.5 → v0.5.1），0 失败。

### 文档

- `docs/v0.6-improvement-backlog.md` — 完整 62 项改进路线图。
- `docs/v0.6-sprint2-backlog.md` — 本轮 13 项细节。
- `docs/ops-runbook.md` — 备份 / 恢复演练 / 分支保护推荐。
- `docs/deploy-docker.md` — Docker 一键启动。

## v0.5.0 — 2026-05-14 · Delivery OS

v0.5 主线：把销售→交付的"中段"做成结构化数据。诊断之后客户上传业务样本数据，AI 出方案包 → SOW → 客户在 Portal 在线确认 → 验收记录。

### 数据流

- **客户数据导入**（`business_data_imports` 表，`src/lib/data-import.ts`）：上传 CSV 或 Excel（.xlsx），自动推断字段类型、null 率、SLA 违规率，输出 `dataQualitySummary`。
- **方案包**（`solution_packages` 表）：结构化的可售方案 — 目标场景、问题陈述、自动化步骤、交付物、验收标准、定价模型。
- **SOW（工作说明书）**（`statement_of_work` 表）：范围（included / excluded）、假设、deliverables、里程碑付款、portal_token、客户审批状态。
- **客户 Portal**（`/portal/[token]`）：tokenized 公开页（无需登录账号），客户可看完整 SOW + 一键确认。
- **验收记录**（`acceptance_records` 表）：已接受功能、已知限制、证据链接、客户签收时间、签收状态。

### 模板与依赖

- 新增 `xlsx` 依赖（Delivery OS Excel 上传的明确例外，AGENTS.md 已固化"该例外不再扩大"原则）。

### E2E 验证

- `npm run e2e:delivery-flow`：lead → diagnostic → solution package → SOW → portal approve → acceptance record 端到端脚本。

## v0.4.0 — 2026-05-14 · Security & Scale Hardening

第四轮迭代：闭合 v0.3 → v0.4 review 中识别的 8 个 P0/P1 安全 & 可扩展性 gap。设计文档：`docs/v0.4-hardening-design.md`。9 个原子 commit。

### Security

- **Rate limiting**（`src/lib/ratelimit.ts`）— 单进程内存 token bucket，按 (route, key) 隔离，可注入时钟做确定性测试。应用到：
  - `POST /login` — 5/15min per (ip+email)，20/15min per ip
  - `POST /api/wecom/callback` — 100/min 全局
  - `POST /api/diagnostics/[id]/generate` — 10/hour per user
  - `POST /api/deliverables/[id]/bundle` — 30/hour per user
  - `POST` TOTP step — 5/5min per user
  - 标准 headers：`X-RateLimit-Limit/-Remaining/-Reset/Retry-After`
- **CSRF**（`src/lib/csrf.ts`）— double-submit cookie 模式，HMAC-SHA256 签名。Server Actions 不需要（Next.js 已内置 Origin/Referer 校验），仅保护 `/api/*` mutating routes。Bearer 请求自动豁免。中间件在 Edge runtime 用 WebCrypto subtle 签发 cookie。
- **`/api/auth/logout` 改 POST + CSRF**：v0.3 的 GET 端点是经典 CSRF 漂移（`<img src=>` 可强制登出），已禁用 GET 返回 405。
- **API tokens (PAT)**（`src/lib/api-tokens.ts`）— 程序化访问 token，格式 `agf_<32 base32>`，SHA-256 hash 存库，plaintext 仅创建时显示一次。`Authorization: Bearer agf_xxx` 替代 cookie。Token 继承用户角色权限。
- **账号锁定 + Server-side sessions**（`src/lib/sessions.ts`）：
  - `login_attempts` 表记录每次登录成败；同一 (email, ip) 在 15 分钟内 5 次失败 → 锁定。一次成功重置计数。
  - `sessions` 表 + cookie 中 `sid` 字段，每次请求查 DB 判断是否被撤销。
  - `/security/sessions` 让用户看 / 撤销自己的活跃会话和最近 10 次登录尝试。
- **2FA TOTP**（`src/lib/totp.ts`，RFC 6238）：HMAC-SHA1 + 30s + 6 位，±1 step 漂移容忍。`/security/2fa` 启用 / 禁用流程；登录新增 TOTP 第二步（5 分钟有效的 pending cookie）。无 QR 库，显示 base32 + otpauth URI 供 Authenticator 应用接收。

### Scale & UX

- **分页 utility**（`src/lib/pagination.ts`）— `parsePagination(URLSearchParams)`, `pageMeta`, `pageHref`。Repo 层 `leadsRepo.list({limit, offset}) + .count()`。
- **FTS5 全局搜索**（`src/lib/search.ts`）— SQLite FTS5 trigram tokenizer，跨 leads / clients / diagnostics / projects。`/search?q=...` 按权限过滤结果（无 `read:clients` 看不到 client 命中），首次访问惰性 rebuild 索引。Topbar 新增搜索框。
- **`/security` 总览页**：4 个 KPI 卡 + 安全 checklist + 跨 2FA / sessions / tokens 的导航。

### Schema v4

- `api_tokens(id, user_id, token_hash, token_prefix, name, last_used_at, revoked_at, created_at)`
- `login_attempts(id, email, ip, ok, at)`
- `sessions(id, user_id, jti, ip, user_agent, last_used_at, revoked_at, created_at)`
- `users.totp_secret` + `users.totp_enabled` （通过 `ALTER TABLE ADD COLUMN` 幂等迁移）
- 虚表 `search_index` (FTS5 trigram)
- v3 → v4 自动升级，无需运维干预

### 测试

- **150 个用例 / 35 个 suite**（v0.3 的 87 个基础上 +63）。
- 新增覆盖：
  - `ratelimit.test.ts` (9)：token bucket 行为 + 头部 + IP 提取
  - `csrf.test.ts` (7)：签名校验 + double-submit + Bearer bypass
  - `api-tokens.test.ts` (8)：plaintext-once + resolve + revoke + 跨用户隔离
  - `sessions.test.ts` (8)：session CRUD + lockout 阈值 + 成功重置 + IP 独立
  - `totp.test.ts` (15)：base32 + 5 个 RFC 6238 时间点 + ±1 step + 拒绝 malformed + otpauth URI
  - `pagination.test.ts` (9)：默认 / clamp / NaN / pageMeta / pageHref
  - `search.test.ts` (7)：CJK 三元组 + body 字段 + 权限过滤 + 空查询 + rebuildAll

### 部署

`.env.example` 已通过 v0.3 PR 同步；v0.4 无新 ENV。CSRF 用现有 `AGENTFLOW_SESSION_SECRET`（默认回退 `AGENTFLOW_PASSWORD`）。

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
- **签名 cookie session** 升级为多用户：payload 含 `sub: user_id`，middleware 通过 `x-agentflow-user-id` header 向 RSC 透传。
- **三种登录方式**：
  - 邮箱 + 密码（主路径）
  - 留空邮箱 + `AGENTFLOW_PASSWORD`（兼容 v0.2 部署）
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
- `AGENTFLOW_SESSION_SECRET`（可选；默认 = `AGENTFLOW_PASSWORD`）
- `WECOM_CORP_ID` / `WECOM_AGENT_ID` / `WECOM_SECRET` / `WECOM_TOKEN` / `WECOM_AES_KEY`（全部缺失时 WeCom 优雅降级）
- `WECOM_DEFAULT_NOTIFY_USERS`

v0.2 → v0.3 升级：`AGENTFLOW_PASSWORD` 不变即可自动 bootstrap admin。

## v0.2.0 — 2026-05-13 · Enterprise Hardening

第二轮迭代：把 v0.1 MVP 提升到可上线给客户用的企业级标准。**新增 14 项**，**修复 0 项**（v0.1 没有上线就没有 bug 回归）。

### Security

- **Auth**（`src/lib/auth.ts` + `src/middleware.ts`）：基于 `AGENTFLOW_PASSWORD` 的 Edge-safe 单租户鉴权。HMAC-SHA256 签名 cookie，HTTP-only + Secure + SameSite=Lax，7 天有效期。错误密码 1.5s 延迟抵御暴力破解。`/share/*`、`/api/health`、`/login` 为公开路由。未设置密码即为「OPEN MODE」(仅开发用，`/api/health` 会标红警告)。
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
