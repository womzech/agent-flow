import Link from "next/link";
import { currentUser } from "@/lib/current-user";
import type { Permission } from "@/lib/schema";

interface NavItem { href: string; label: string; hint?: string; require?: Permission }
interface NavSection { title: string; items: NavItem[] }

const NAV_SECTIONS: NavSection[] = [
  {
    title: "总览",
    items: [{ href: "/", label: "Dashboard", hint: "本月 KPI" }],
  },
  {
    title: "销售 Sales",
    items: [
      { href: "/leads", label: "线索 Pipeline", hint: "看板视图", require: "read:leads" },
      { href: "/clients", label: "客户名册", hint: "已成交", require: "read:clients" },
      { href: "/diagnostics", label: "诊断报告", hint: "5000-10000 元 hook", require: "read:diagnostics" },
    ],
  },
  {
    title: "设计 Design",
    items: [
      { href: "/blueprints", label: "工作流蓝图", hint: "节点式编辑", require: "read:projects" },
      { href: "/pricing", label: "报价计算器", hint: "ROI 自动算", require: "read:templates" },
    ],
  },
  {
    title: "开发 Development",
    items: [{ href: "/templates", label: "模板库", hint: "7 个内置模板", require: "read:templates" }],
  },
  {
    title: "交付 Delivery",
    items: [
      { href: "/projects", label: "项目工作区", hint: "试点 → 维护", require: "read:projects" },
      { href: "/tickets", label: "工单", hint: "月度维护", require: "read:tickets" },
    ],
  },
  {
    title: "运维 Ops",
    items: [
      { href: "/users", label: "用户管理", hint: "RBAC", require: "write:users" },
      { href: "/roles", label: "角色 / 权限", hint: "矩阵视图", require: "read:users" },
      { href: "/audit", label: "审计日志", hint: "全部状态变更", require: "read:audit" },
      { href: "/wecom", label: "企业微信", hint: "回调 / 推送", require: "write:wecom" },
      { href: "/api-tokens", label: "API Tokens", hint: "n8n / Zapier 集成" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

export async function Sidebar() {
  const u = await currentUser();
  const visibleSections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.require || u?.permissions.has(it.require)) }))
    .filter((s) => s.items.length > 0);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-forge-line bg-forge-panel/60 px-4 py-6 lg:flex lg:flex-col">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-500 font-bold text-forge">AF</div>
        <div className="leading-tight">
          <div className="font-semibold text-ink-50">AgentForge</div>
          <div className="text-xs text-forge-muted">智造工坊 · v0.3</div>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-forge-muted">{section.title}</div>
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm text-ink-200 transition hover:bg-forge-line/60 hover:text-ink-50"
                  >
                    <div className="font-medium">{item.label}</div>
                    {item.hint ? <div className="text-xs text-forge-muted">{item.hint}</div> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-6 rounded-md border border-forge-line bg-forge p-3 text-xs text-forge-muted">
        <div className="mb-1 font-semibold text-ink-200">销售剧本</div>
        <div>第 1 周：录 3 个 demo 视频，发朋友圈 / 闲鱼。</div>
      </div>
    </aside>
  );
}
