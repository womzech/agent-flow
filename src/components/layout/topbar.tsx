import Link from "next/link";

export function Topbar() {
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
      </div>
    </header>
  );
}
