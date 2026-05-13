import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="text-5xl font-bold text-accent-500">404</div>
        <h1 className="mt-3 text-xl font-semibold text-ink-50">页面不见了</h1>
        <p className="mt-2 text-sm text-forge-muted">你访问的资源不存在。可能是被删除了，或链接拼错了。</p>
        <Link href="/" className="mt-6 inline-block rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
          返回工作台
        </Link>
      </div>
    </div>
  );
}
