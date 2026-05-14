"use client";

import { useState, useTransition } from "react";

interface Props {
  approve: () => Promise<void>;
}

export default function PortalApproveButton({ approve }: Props) {
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await approve();
      setDone(true);
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center">
        <div className="font-semibold text-emerald-300">已确认 ✓</div>
        <div className="mt-1 text-sm text-slate-400">感谢您的确认，顾问将尽快联系您</div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="w-full rounded-lg bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
    >
      {isPending ? "处理中..." : "我确认 — 同意本 SOW 条款"}
    </button>
  );
}
