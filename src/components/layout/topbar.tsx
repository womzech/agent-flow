import Link from "next/link";
import { currentUser } from "@/lib/current-user";

export async function Topbar() {
  const u = await currentUser();
  return (
    <header className="flex h-14 items-center justify-between border-b border-forge-line bg-forge-panel/40 px-6">
      <div className="flex items-center gap-4 text-sm text-forge-muted">
        <span className="lg:hidden font-semibold text-ink-50">AgentForge</span>
        <span className="hidden lg:inline">销售 → 设计 → 开发 → 交付</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/leads/new"
          className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm text-ink-100 transition hover:bg-forge-line/60"
        >
          + 新建线索
        </Link>
        <Link
          href="/diagnostics/new"
          className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge transition hover:bg-accent-400"
        >
          + 新建诊断
        </Link>
        {u ? (
          <div className="ml-2 flex items-center gap-2 rounded-md border border-forge-line bg-forge px-2 py-1 text-xs">
            <span className="text-forge-muted">{u.user.name}</span>
            <span className="rounded bg-accent-500/15 px-1.5 py-0.5 font-medium text-accent-300">{u.role.name}</span>
          </div>
        ) : null}
        <a
          href="/api/auth/logout"
          title="退出"
          className="rounded-md border border-forge-line bg-forge px-2 py-1.5 text-xs text-forge-muted transition hover:text-ink-100"
        >
          ⎋
        </a>
      </div>
    </header>
  );
}
