# Architecture

```
                    ┌──────────────────────────────┐
                    │      Next.js 14 (single)     │
                    │                              │
   Browser ───────► │   App Router (RSC + Client)  │
                    │                              │
                    │   API routes / route handlers│
                    └──────────┬───────────────────┘
                               │
            ┌──────────────────┼─────────────────────────┐
            │                  │                         │
            ▼                  ▼                         ▼
   ┌────────────────┐  ┌────────────────┐    ┌────────────────────┐
   │ better-sqlite3 │  │ Anthropic SDK  │    │  archiver (zip)    │
   │ data/agent...db│  │ Claude Sonnet  │    │  交付物打包         │
   └────────────────┘  └────────────────┘    └────────────────────┘
```

## 进程模型

只有一个 Next.js 进程。所有状态在 SQLite 文件里。

## 目录约定

```
src/
├── app/
│   ├── layout.tsx          # 全局布局（Sidebar + Topbar）
│   ├── page.tsx            # / Dashboard
│   ├── globals.css         # Tailwind + 自定义 CSS 变量
│   ├── leads/              # 销售
│   ├── clients/
│   ├── diagnostics/        # 诊断
│   ├── projects/           # 项目
│   ├── blueprints/         # 设计
│   ├── templates/          # 模板库
│   ├── settings/           # 配置
│   ├── share/[token]/      # 客户侧分享页（无鉴权）
│   └── api/                # 路由处理器
│       ├── leads/route.ts
│       ├── diagnostics/route.ts
│       ├── diagnostics/[id]/generate/route.ts  # 调用 Claude
│       ├── blueprints/route.ts
│       ├── deliverables/[id]/bundle/route.ts   # 生成 zip
│       └── ...
├── components/
│   ├── ui/                 # 基础组件（Button, Card, Input, Dialog）
│   ├── layout/             # Sidebar, Topbar
│   ├── leads/              # Kanban 等领域组件
│   ├── diagnostics/        # 问卷、报告渲染
│   └── blueprints/         # 节点画布
└── lib/
    ├── db.ts               # better-sqlite3 实例 + 通用查询
    ├── schema.ts           # 表定义 + 迁移
    ├── repo.ts             # 仓库层（按表分组的纯函数）
    ├── anthropic.ts        # Claude client + prompt builders
    ├── templates.ts        # 内置模板
    ├── pricing.ts          # 报价计算
    ├── bundler.ts          # 交付物打包
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

## 数据流：从模板到交付包

```
[Browser] /projects/[id]/deliverables/new
   │ 选择 template + 填参数
   ▼
[POST /api/deliverables]
   │ repo.deliverables.create(project_id, template_slug, params)
   ▼
[Browser] redirect /projects/[id]/deliverables/[did]
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

## 安全性

- `.env.local` 存 ANTHROPIC_API_KEY，不入仓。
- 分享链接的 token 用 `crypto.randomUUID()` 生成，存到诊断/项目 row 的 `share_token` 字段。
- 没有用户系统；本地运行假设单顾问使用。部署到云时建议套一层 Cloudflare Access 或类似零信任。

## 未来扩展点

- DB 切换：把 `src/lib/db.ts` 抽象到 `interface`，将来可以替换为 Postgres（Drizzle 风格）。
- Bundler 扩展：增加 makefile / docker / pip-requirements 输出。
- 实时执行：在 `src/lib/runner/` 加 sandbox，把 Python 脚本变成可在浏览器试运行。
