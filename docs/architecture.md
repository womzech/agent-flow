# Architecture

```
                    ┌──────────────────────────────────────┐
                    │        Next.js 14 (single process)   │
                    │                                      │
   Browser ───────► │  App Router (RSC + Client Components)│
                    │  Middleware (auth + CSRF + rate limit)│
                    │  API Route Handlers                  │
                    └────────┬──────────────┬──────────────┘
                             │              │
            ┌────────────────┼──────────────┼──────────────┐
            │                │              │              │
            ▼                ▼              ▼              ▼
   ┌──────────────┐  ┌──────────────┐ ┌──────────┐ ┌─────────────┐
   │better-sqlite3│  │Anthropic SDK │ │ archiver │ │    xlsx     │
   │data/agent.db │  │Claude Sonnet │ │ zip 打包 │ │Excel 解析   │
   └──────────────┘  └──────────────┘ └──────────┘ └─────────────┘
```

> `xlsx` 是 Delivery OS Excel 上传的明确例外（见 `AGENTS.md` 依赖策略），不再扩大。

## 进程模型

只有一个 Next.js 进程。所有状态在 SQLite 单文件 `data/agent-flow.db` 里。

**单机边界**：不支持多租户，数据库不做跨进程共享，部署到云时建议套 Cloudflare Access 或类似零信任。若业务增长到需要 Postgres，把 `src/lib/db.ts` 替换为兼容接口即可（Drizzle 风格）。

## 认证 / 会话

- **登录流程**（v0.2 起）：POST `/api/auth/login` → PBKDF2 密码验证 → 签发 HMAC 签名 cookie（`jti` 写入 `sessions` 表）
- **2FA TOTP（v0.4）**：登录后若 `totp_enabled`，Cookie 设为 pending 状态，跳转二步验证页，TOTP 校验通过后正式激活 session
- **服务端 session 撤销**：每个请求在 `sessions` 表核查 `jti`；管理员可单条撤销
- **账号锁定**：`login_attempts` 表记录失败次数，超阈值锁定账号

## RBAC（多用户权限）

- 4 个内置角色：`owner`（完整权限）/ `consultant`（业务读写）/ `sales`（线索为主）/ `viewer`（只读）
- 22 条权限条目（`read|write` × 11 个资源）存于 `permissions` + `role_permissions` 表
- Middleware 在路由层按 `Permission` 集合过滤；API 路由通过 `getCurrentUser()` 取用户权限再二次校验
- 管理界面：`/users`（用户 CRUD）、`/roles`（权限矩阵查看，`/security` 总览）

## 安全加固（v0.4）

- **CSRF**：Double-submit cookie；POST/PATCH/DELETE 路由验证 `x-csrf-token` header
- **Rate limiting**：Token-bucket（内存），覆盖 login / WeCom / AI generate / bundle / TOTP 端点
- **PAT（Personal Access Token）**：`api_tokens` 表存 SHA-256 hash；明文仅在创建时返回一次；用于 n8n / Zapier Bearer Auth
- **审计日志**：所有写操作通过 `audit.ts` 写入 `audit_log`（actor / action / entity / entity_id / payload）

## 企业微信（v0.3）

- 自建应用回调：`/api/wecom/callback` 验证签名 + 解密
- 异步处理：收到消息后立即返回空串（微信要求），用 `setImmediate` 启动 LLM 回复后再推送
- 6 个 slash 命令（`/lead`、`/diag`、`/project`、`/help` 等）+ Claude haiku 中文意图路由
- 推送：`src/lib/wecom/notify.ts` 封装主动消息发送（无配置时 no-op）

## FTS5 全文搜索（v0.4 → v0.5.1 扩展）

- 虚拟表 `search_index`（trigram tokenizer）在 `search.ts` 中懒初始化
- v0.5.1 起覆盖 8 类实体：`lead` / `client` / `diagnostic` / `project` / `import` / `package` / `sow` / `acceptance`
- 搜索结果按当前用户权限过滤可见 `kind`：
  - `read:leads` → lead
  - `read:clients` → client + import
  - `read:diagnostics` → diagnostic
  - `read:projects` → project + package + sow + acceptance
- `rebuildAll()` 一次性从 8 张源表回灌索引；新增条目可通过 `indexEntity(kind, refId, title, body)` 增量更新

## Token 化外发链接（v0.5 + v0.5.1 hardening）

- 两条 token：`diagnostics.share_token`（诊断分享）与 `statement_of_work.portal_token`（SOW 客户门户）
- v0.5.1 schema v6：每条 token 都附 4 个字段（通过 `applyAlterColumnMigrations()` 幂等 ALTER）：
  - `token_expires_at` — 默认 30 天 TTL，可通过 `ensureShareToken({ttlDays})` / `sowRepo.create({portal_token_ttl_days})` 自定义
  - `token_revoked_at` — 撤回时间戳，公开页直接返回"已失效"
  - `token_view_count` + `token_last_viewed_at` — 每次客户访问递增，顾问端 UI 可见
- `/diagnostics/[id]` 与 `/sow/[id]` 提供撤回按钮（Server Action），调用 `revokeShareToken` / `revokePortalToken` 并写审计（`share.revoke` / `portal.revoke`）
- 周期性 `npm run cleanup` 会把过期且非活跃的 token 列设为 NULL，缩小公开攻击面

## 合规与隐私

- **算法备案号占位**：`src/components/layout/compliance-footer.tsx` 读取 `AGENTFLOW_ALGORITHM_FILING` 环境变量，在 app 页脚 + 所有公开页（`/share/[token]` / `/portal/[token]`）渲染"算法备案号：xxx"，符合中国生成式 AI 服务"显著位置展示"要求；空值时不渲染
- **PII 检测**：`src/lib/data-import.ts` 的 `detectPii()` 用正则识别身份证 / 手机 / 邮箱 / 银行卡（列名启发式）/ 护照，≥2 匹配触发，写入 `DataQualitySummary.piiFlags`；`/data-imports/[id]` 红色横幅展示脱敏样例，提醒顾问按 PIPL 最小化原则评估

## 目录约定

```
src/
├── app/
│   ├── layout.tsx              # 全局布局（Sidebar + Topbar）
│   ├── page.tsx                # / Dashboard
│   ├── globals.css
│   ├── leads/                  # 销售
│   ├── clients/
│   ├── diagnostics/            # 诊断
│   ├── projects/               # 项目
│   ├── blueprints/             # 设计
│   ├── templates/              # 模板库
│   ├── data-imports/           # Delivery OS 数据导入（v0.5）
│   ├── solution-packages/      # Delivery OS 方案包（v0.5）
│   ├── sow/                    # Delivery OS SOW（v0.5）
│   ├── portal/[token]/         # 客户 tokenized 确认页（公开，v0.5）
│   ├── users/                  # 用户管理（v0.3）
│   ├── roles/                  # 角色权限（v0.3）
│   ├── security/               # 安全总览 + 2FA + sessions（v0.4）
│   ├── audit/                  # 审计日志（v0.2）
│   ├── api-tokens/             # PAT 管理（v0.4）
│   ├── search/                 # 全文搜索（v0.4）
│   ├── wecom/                  # 企业微信配置（v0.3）
│   ├── settings/               # 配置
│   ├── share/[token]/          # 诊断报告分享页（公开）
│   └── api/                    # 路由处理器
│       ├── acceptance/
│       ├── auth/logout/
│       ├── blueprints/[id]/
│       ├── data-imports/       # CSV/Excel 上传（v0.5）
│       ├── data-imports/[id]/
│       ├── deliverables/[id]/bundle/
│       ├── deliverables/[id]/download/
│       ├── diagnostics/[id]/generate/
│       ├── export/             # CSV/JSON 导出
│       ├── health/
│       ├── solution-packages/  # v0.5
│       ├── sow/                # v0.5
│       └── wecom/callback/
├── components/
│   ├── ui/                     # 基础组件（Button, Card, Input, Dialog）
│   ├── layout/                 # Sidebar, Topbar, ComplianceFooter（v0.5.1）
│   ├── leads/                  # Kanban 等领域组件
│   ├── diagnostics/
│   ├── blueprints/
│   └── delivery-os/            # v0.5 Delivery OS 组件
└── lib/
    ├── db.ts                   # better-sqlite3 实例 + 通用查询（含 v6 idempotent ALTER）
    ├── schema.ts               # 表定义（SCHEMA_VERSION=6）+ 迁移 + RBAC catalog
    ├── repo.ts                 # 仓库层 + isTokenExpired / revokeShareToken / recordShareView（v0.5.1）
    ├── delivery-os.ts          # Delivery OS 仓库层（v0.5）+ OutcomePricing / 撤回/视图统计（v0.5.1）
    ├── data-import.ts          # CSV / Excel 解析 + 数据质量分析 + PII 检测（v0.5.1）
    ├── anthropic.ts            # Claude client + prompt caching + 指数回退重试（v0.5.1）
    ├── log.ts                  # 结构化 JSON logger（v0.5.1）
    ├── templates.ts            # 内置 10 个模板（v0.5.1）
    ├── pricing.ts              # 报价计算
    ├── bundler.ts              # 交付物打包
    ├── search.ts               # FTS5 搜索（v0.4 / v0.5.1 扩展到 8 类）
    ├── auth.ts                 # 登录 / PBKDF2 / cookie
    ├── sessions.ts             # 服务端 session 管理（v0.4）
    ├── api-tokens.ts           # PAT 管理（v0.4）
    ├── csrf.ts / csrf-client.ts# CSRF double-submit（v0.4）
    ├── ratelimit.ts            # Token-bucket rate limiter（v0.4）
    ├── totp.ts                 # TOTP 2FA（v0.4）
    ├── password.ts             # PBKDF2 封装
    ├── audit.ts                # 审计日志写入
    ├── bootstrap.ts            # DB 初始化 + 角色/权限种子
    ├── current-user.ts         # 从 cookie 读取当前用户 + 权限
    ├── pagination.ts           # 通用分页 utility
    ├── validate.ts             # 参数校验 helper
    ├── wecom/                  # 企业微信集成（v0.3）
    └── utils.ts
```

## 数据流：从问卷到诊断报告

```
[Browser] /diagnostics/new
   │ 表单提交 (questionnaire JSON)
   ▼
[POST /api/diagnostics]
   │ repo.diagnostics.create() → 写 row, status=draft
   ▼
[Browser] redirect /diagnostics/[id]
   │ 点 "生成报告"
   ▼
[POST /api/diagnostics/[id]/generate]
   │ 从 row 读 questionnaire
   │ anthropic.generateDiagnosticReport(questionnaire) → markdown
   │ repo.diagnostics.update(id, { report_markdown, status: 'ready' })
   ▼
[Browser] 渲染 markdown，显示"分享链接"
```

## 数据流：Delivery OS 闭环（v0.5）

```
[Browser] /data-imports/new
   │ 上传 CSV 或 Excel (.xlsx)
   ▼
[POST /api/data-imports]
   │ multipart 解析
   │ parseCSV() 或 parseExcel()
   │ analyzeQuality(headers, rows) → DataQualitySummary
   │ businessDataImportsRepo.create(...)
   ▼
[Browser] /data-imports/[id]
   │ 展示质量报告 + 推荐模板
   │ 点"生成方案包"
   ▼
[POST /api/solution-packages]
   │ generateSolutionPackageFromImport(import) → SolutionPackage input
   │ solutionPackagesRepo.create(...)
   ▼
[Browser] /solution-packages/[id]
   │ 确认方案内容 + 报价
   │ 点"生成 SOW"
   ▼
[POST /api/sow]
   │ generateSOWFromPackage(pkg) → SOW input（含 portal_token）
   │ sowRepo.create(...)
   ▼
[Browser] 复制 /portal/[token] 链接发给客户
   ▼
[Client Browser] /portal/[token]   ← 公开页，无需登录
   │ 客户浏览 SOW，点"确认"
   ▼
[POST /api/sow/[id]/approve]
   │ sowRepo.approve(id)
   ▼
[Browser] /projects/[id]/acceptance
   │ 填写验收内容（已接受功能 / 已知限制 / 证据链接）
   │ 点"客户签收"
   ▼
[POST /api/acceptance/[id]/sign]
   │ acceptanceRecordsRepo.sign(id)
   ▼
[Browser] 签收完成，项目闭环
```

## 数据流：从模板到交付包

```
[Browser] /projects/[id]/deliverables/new
   │ 选择 template + 填参数
   ▼
[POST /api/deliverables]
   │ repo.deliverables.create(project_id, template_slug, params)
   ▼
[Browser] /projects/[id]/deliverables/[did]
   │ 点 "打包"
   ▼
[POST /api/deliverables/[did]/bundle]
   │ 1. 读 template 定义
   │ 2. 用 params 渲染 python_template / n8n_template / readme_template
   │ 3. archiver 生成 zip → 写 data/bundles/<did>.zip
   │ 4. 更新 row.bundle_path
   ▼
[Browser] 显示下载链接 /api/deliverables/[did]/download
```

## API 路由约定

- **薄路由**：业务逻辑放 `src/lib/`，路由只做参数校验 + 调用 lib 函数 + 序列化响应
- **公开路由**：`/api/health`、`/api/wecom/callback`、`/portal/[token]`、`/share/[token]`（无鉴权）
- **错误形状统一**：`{ error: string, code?: string }` + 对应 HTTP 状态码

## 未来扩展点

- **DB 切换**：把 `src/lib/db.ts` 抽象到 `interface`，将来可以替换为 Postgres。
- **LLM gateway**：当前只对接 Anthropic。`src/lib/anthropic.ts` 已经把客户端单例化，下一步抽象为 provider 接口以支持 DeepSeek / 通义 / 智谱 / 本地 vLLM（v0.6 backlog 的 F2 项，敏感行业必备）。
- **向量数据库**：当前 `doc-qa-bot` / `inquiry-reply` 模板让客户自带 Chroma；平台层未集成。v0.6 backlog 计划接入 sqlite-vec 或 Chroma。
- **Bundler 扩展**：增加 makefile / docker / pip-requirements 输出。
- **多租户**：当前单机单顾问；SaaS 化需在 `users` 表加 `org_id`，所有查询加租户过滤。
- **电子签名**：`AcceptanceRecord.signoff_status` 现是文本枚举，v0.6 可接入 hash-chain 或 DocuSign 类外部签名。
