# v0.3 设计文档：企业微信交互 + 数据库权限分层

> 状态：草案 → 实施中
> 上一次更新：2026-05-13
> 适用版本：AgentFlow v0.3.0

## 1. 目标

让 AgentFlow 从「单人本地工作台」升级为「小团队远程协作工作台」：

1. **企业微信交互**：团队成员（销售 / 顾问 / 老板）在企业微信里 @ 机器人或私聊机器人，可以查看自己负责的线索 / 项目状态、新建线索、收到 AgentFlow 的关键事件推送（新线索、交付物完成、收款入账）。
2. **数据库权限分层**：不同角色（owner / consultant / sales / viewer）能访问的数据不同；权限映射存数据库；可在 UI 里管理。

非目标（v0.3 不做）：

- 多公司 / 多 corp 数据隔离（仍是单租户，但多用户）
- 行级数据隔离（如「销售只能看自己的客户」）—— 留 v0.4
- 企业微信审批流 / 报销集成
- 客户侧企业微信端口（这是 SCRM 场景，超出 v0.3 范围）

## 2. RBAC 数据模型

### 表

```sql
CREATE TABLE users (
  id              INTEGER PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  password_hash   TEXT NOT NULL,     -- base64(PBKDF2-SHA256 32B)
  password_salt   TEXT NOT NULL,     -- base64 32B
  password_iter   INTEGER NOT NULL DEFAULT 100000,
  wecom_userid    TEXT UNIQUE,       -- 企业微信内 userid（小写）
  role_id         INTEGER NOT NULL REFERENCES roles(id),
  status          TEXT NOT NULL DEFAULT 'active',   -- active / disabled
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at   TEXT
);

CREATE TABLE roles (
  id          INTEGER PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  is_system   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE permissions (
  id          INTEGER PRIMARY KEY,
  action      TEXT NOT NULL,    -- read | write
  resource    TEXT NOT NULL,    -- leads | clients | diagnostics | projects | templates | deliverables | tickets | revenue | audit | users | wecom
  description TEXT NOT NULL,
  UNIQUE(action, resource)
);

CREATE TABLE role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  permission_id INTEGER NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
```

### 内置角色（is_system=1，不可删）

| 角色 | 权限范围 |
|---|---|
| owner | 所有权限（含 users / wecom 管理） |
| consultant | read+write 所有业务实体（leads / clients / diagnostics / projects / templates / deliverables / tickets / revenue），audit 只读，无 users / wecom |
| sales | read+write leads，read clients / diagnostics / projects。无 revenue / audit / users / wecom |
| viewer | read 全部业务实体；无任何写入 |

### 权限资源清单（22 条）

`read|write` × `{leads, clients, diagnostics, projects, templates, deliverables, tickets, revenue, audit, users, wecom}` = 22 条。

> 注：`templates` 内置模板永远 read-only；`write:templates` 预留给 v0.4 自建模板。

## 3. 认证流程

### 登录

- 表单字段：`email` + `password`
- 后端：查 `users` by email → PBKDF2 验证 → 写签名 cookie `{ sub: user_id, exp }` → 重定向 next。
- **降级兼容**：若 `email = ""` 且密码 = `AGENTFLOW_PASSWORD`，自动以 bootstrap admin 登录（兼容 v0.2 部署）。
- 失败 1.5s 延迟，audit `auth.fail`。
- 成功 audit `auth.login`，更新 `users.last_login_at`。

### Bootstrap

应用启动时（第一次写 schema 后）：

1. 若 `users` 表为空且 `process.env.AGENTFLOW_PASSWORD` 已设置：
   - 创建用户 `admin@local` / 密码 = `AGENTFLOW_PASSWORD` / role = owner
   - audit `user.create` payload `{ via: "bootstrap" }`
2. 若空且未设置密码：保持空表，路由会显示「请设置 AGENTFLOW_PASSWORD 或调用 /api/admin/bootstrap」

### Session

- Cookie 内容：`{ sub: user_id, exp }`（签名同 v0.2）。
- middleware 解 cookie → `verifySession()` → 把 user_id 通过 headers `x-agentflow-user-id` 透传给 RSC。
- `currentUser()` 服务端 helper：从 headers 拿 user_id → 查 DB → 返回 `{ user, role, permissions[] }`。
- 缓存：每个请求拿一次即可（RSC 调用 `cache()`）。

## 4. 权限检查

### 服务端

```ts
const { user, permissions } = await currentUser();
if (!permissions.has("write:leads")) forbidden();
// or:
await requirePermission("write:leads");
```

`requirePermission` 缺权限时 throw → 由 `(app)/error.tsx` 兜底，渲染 403 文案。

### UI 层

- 每个写按钮 / 表单根据当前 permissions 隐藏或 disabled。
- Sidebar nav 项按 permissions 过滤。

### API 路由

- 每个 mutating route 先 `currentUserFromRequest(req)` → `requirePermission()`。
- 失败返回 `{ error, code: "auth/forbidden" }` HTTP 403。

## 5. 企业微信集成

### 5.1 ENV 变量

```
WECOM_CORP_ID=ww12345...
WECOM_AGENT_ID=1000002
WECOM_SECRET=xxx          # 自建应用 secret
WECOM_TOKEN=xxx           # 回调 token
WECOM_AES_KEY=43-char...  # EncodingAESKey（不带末尾 =）
WECOM_CALLBACK_URL=https://your-host/api/wecom/callback   # 仅文档展示用
WECOM_DEFAULT_NOTIFY_USERS=zhangsan|lisi                  # | 分隔，"@all" 表全员
```

如 `WECOM_CORP_ID` 未设置，所有 WeCom 功能优雅降级（callback 路由返回 503 + 提示）。

### 5.2 加解密

精确协议（来自 https://developer.work.weixin.qq.com/document/path/90968）：

| 步骤 | 算法 |
|---|---|
| AESKey | `Buffer.from(encodingAESKey + "=", "base64")` → 32B |
| IV | AESKey 前 16B |
| 加密 | AES-256-CBC + PKCS7 padding（块 32B，1-32 填充字节） |
| 明文 | `random(16B) ‖ msg_len(4B BE) ‖ msg ‖ receiveid(=corpid)` |
| 签名 | `sha1(sort([token, ts, nonce, encrypt_b64]).join(""))` |

实现见 `src/lib/wecom/crypto.ts`。**不引入** crypto-js / wxbizmsgcrypt 等三方包；node:crypto + setAutoPadding(false) 足够。

### 5.3 URL 验证（自建应用首次配置）

```
GET /api/wecom/callback?msg_signature=&timestamp=&nonce=&echostr=
```

1. `decrypt(echostr)` → 拿到明文 msg
2. 校验签名
3. HTTP 200 纯文本 body = msg

### 5.4 被动接收 + 异步回复

企业微信 5 秒超时，LLM 推理可能更慢，所以：

```
1. POST /api/wecom/callback
2. 解密 → 路由意图
3. 立即响应 ""（空串，企微视为 ACK）
4. 异步 (waitUntil / setImmediate)：
   - 调用 intent handler（含 LLM）
   - 通过 sendText/sendMarkdown 主动推送给 FromUserName
5. audit log: wecom.receive / wecom.reply
```

Next.js 在 Edge runtime 没有 waitUntil，所以 callback 路由用 Node runtime + fire-and-forget。

### 5.5 意图路由

```
/help              -> 显示命令清单
/me                -> 显示当前 wecom_userid 对应的 AgentFlow 用户 / 角色 / 权限
/pipeline          -> 当前 leads pipeline 统计
/leads [stage]     -> 列出某阶段线索（默认 contacted+diagnosing+quoted）
/projects          -> 列出活跃项目
/diag <client>     -> 列出该客户的诊断
其他               -> 交给 Claude，给定 schema 描述 + 用户角色权限，让 Claude 返回 JSON intent
```

Claude intent 结构：

```json
{
  "intent": "list_leads | list_projects | get_diagnostic | smalltalk",
  "filters": {"stage": "diagnosing"},
  "summary": "..."
}
```

### 5.6 主动推送（事件 → WeCom）

事件触发后调 `notifyWecom({ to, type, payload })`：

| 事件 | 默认通知谁 | 内容 |
|---|---|---|
| lead.create | 全员或线索 owner | 公司 / 联系人 / 渠道 / 痛点摘要 |
| diagnostic.generate | 创建者 + admins | 报告链接 + 报价摘要 |
| deliverable.bundle | 项目负责人 | 客户名 / 模板 / 下载链接 |
| revenue.add | admins | 类型 / 金额 / 客户 |

实现：在现有 audit `record()` 调用点旁挂一个 `notifyOnEvent()`。失败不阻塞主流程。

## 6. 数据流总图

```
                           ┌────────────────────┐
                           │  AgentFlow Web UI │
                           │   email+password   │
                           └─────────┬──────────┘
                                     │ session cookie {sub:user_id}
                                     ▼
                  ┌──────── middleware ────────┐
                  │ verify cookie              │
                  │ inject x-agentflow-user-id│
                  └─────────┬──────────────────┘
                            │
        ┌───────────────────┼─────────────────────┐
        ▼                   ▼                     ▼
   currentUser()        Server Action         API Route
   + permissions        requirePermission()   requirePermission()
                            │                     │
                            └─────────┬───────────┘
                                      ▼
                         ┌──────── SQLite ────────┐
                         │ users + role_perms     │
                         │ leads / clients / ...  │
                         │ audit_log              │
                         └──────────┬─────────────┘
                                    │
                                    ▼
                       ┌──── notifyOnEvent() ────┐
                       │ select recipients       │
                       │ render markdown         │
                       └──────────┬──────────────┘
                                  │ HTTPS
                                  ▼
                         ┌────────────────┐
   企微用户 ◀────────────│   WeCom API    │
   @ 机器人/私聊         │  qyapi.weixin  │
                         └────────┬───────┘
                                  │ encrypted POST
                                  ▼
                ┌──── /api/wecom/callback ────┐
                │ decrypt + verify signature  │
                │ ACK ""                      │
                │ async: intent → reply push  │
                └─────────────────────────────┘
```

## 7. 实施顺序（10 个提交）

| # | 内容 | 验证 |
|---|---|---|
| 1 | 本设计文档 | 文档完整 |
| 2 | Schema v3 + repos + bootstrap | typecheck + seed |
| 3 | Auth refactor 多用户 | tests |
| 4 | requirePermission 接入 | tests + 手工 403 |
| 5 | /users + /roles 管理 UI | build + smoke |
| 6 | WeCom 加解密 + token 缓存 + push helper | tests（含官方 sample vectors） |
| 7 | /api/wecom/callback URL 验证 + 收消息 | tests + 手工 curl |
| 8 | 意图路由 + Claude 兜底 | tests + 手工 |
| 9 | 事件 → WeCom 推送 | tests + 手工 |
| 10 | 全验证 + push v0.3 | typecheck + lint + test + build |

## 8. 兼容性

- v0.2 数据库自动升级到 v3：现有 leads / clients / ... 表不动；新增 users + roles + permissions + role_permissions。
- v0.2 `AGENTFLOW_PASSWORD` 部署：首次启动自动建 `admin@local` / owner，密码即 ENV 值。
- v0.2 单一密码登录：表单中 email 留空时，依然接受 `AGENTFLOW_PASSWORD` 作为 admin 登录捷径。

## 9. 安全注记

- 密码：PBKDF2-SHA256 100k iter + 32B random salt + 32B hash，全 base64 存储。考虑 v0.5 升级到 argon2id（要新依赖）。
- WeCom token：仅在内存缓存，重启即重新拉取。不入库。
- WeCom AES key：明文存 `.env`，不入库。`/audit` UI 永远不显示 key 内容。
- 回调签名失败 / corpid 不匹配：HTTP 400 + audit `wecom.fail`。
- LLM 处理用户消息时：明确告诉 Claude 当前用户的 role + permissions，让 Claude 在权限外的请求时拒绝。

## 10. 参考文档

- 加解密方案：https://developer.work.weixin.qq.com/document/path/90968
- 接收消息：https://developer.work.weixin.qq.com/document/path/90930
- 主动发消息：https://developer.work.weixin.qq.com/document/path/90236
- gettoken：https://developer.work.weixin.qq.com/document/path/91039
