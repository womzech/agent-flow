export default function AppLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-forge-muted">
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500"></div>
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500 [animation-delay:120ms]"></div>
        <div className="h-2 w-2 animate-pulse rounded-full bg-accent-500 [animation-delay:240ms]"></div>
        <span>加载中…</span>
      </div>
    </div>
  );
}
