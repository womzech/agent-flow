import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ComplianceFooter } from "@/components/layout/compliance-footer";

/**
 * All authenticated pages depend on per-request session state (via
 * currentUser / requirePermission), so prerendering them would either crash
 * ("请先登录") or leak guest data. Force every (app)/* page to render
 * server-side on demand.
 */
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-x-hidden p-6 lg:p-8">{children}</main>
        <ComplianceFooter className="border-t border-forge-line/40 px-6 py-2" />
      </div>
    </div>
  );
}
