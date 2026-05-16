/**
 * Compliance footer — shows algorithm filing number ("算法备案号") when the
 * AGENTFLOW_ALGORITHM_FILING env var is set. Mounted globally for app pages
 * and on every public-facing share/portal page so it satisfies China generative-AI
 * service regulations ("显著位置展示" requirement).
 *
 * When the env var is empty / unset, this returns null so non-compliant
 * deployments (dev, overseas) stay clean.
 */
export function ComplianceFooter({ className = "" }: { className?: string }) {
  const filing = (process.env.AGENTFLOW_ALGORITHM_FILING || "").trim();
  if (!filing) return null;
  return (
    <div className={`text-center text-[11px] text-forge-muted ${className}`}>
      算法备案号：<span className="font-mono">{filing}</span>
    </div>
  );
}
