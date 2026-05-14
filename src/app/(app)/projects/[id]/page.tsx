import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Pill, Section, Select, Textarea } from "@/components/ui";
import {
  blueprintsRepo,
  clientsRepo,
  deliverablesRepo,
  diagnosticsRepo,
  projectsRepo,
  revenueRepo,
  ticketsRepo,
} from "@/lib/repo";
import {
  businessDataImportsRepo,
  solutionPackagesRepo,
  sowRepo,
  acceptanceRecordsRepo,
} from "@/lib/delivery-os";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  REVENUE_KINDS,
  REVENUE_KIND_LABELS,
  type ProjectStatus,
  type RevenueKind,
  type TicketPriority,
} from "@/lib/schema";
import { TEMPLATES, TEMPLATE_BY_SLUG } from "@/lib/templates";
import { fmtCents, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function updateProject(id: number, formData: FormData) {
  "use server";
  const cur = projectsRepo.get(id);
  if (!cur) return;
  projectsRepo.update(id, {
    name: String(formData.get("name") ?? cur.name).trim(),
    status: (formData.get("status") as ProjectStatus) || cur.status,
    project_fee_cents: Math.round(Number(formData.get("project_fee") || cur.project_fee_cents / 100) * 100),
    monthly_fee_cents: Math.round(Number(formData.get("monthly_fee") || cur.monthly_fee_cents / 100) * 100),
    notes: String(formData.get("notes") ?? cur.notes),
  });
  redirect(`/projects/${id}`);
}

async function addDeliverable(projectId: number, formData: FormData) {
  "use server";
  const slug = String(formData.get("template_slug") ?? "").trim();
  const t = TEMPLATE_BY_SLUG[slug];
  if (!t) return;
  const params: Record<string, string> = {};
  for (const p of t.params) {
    const v = formData.get(`p_${p.key}`);
    params[p.key] = typeof v === "string" && v ? v : p.default ?? "";
  }
  deliverablesRepo.create({ project_id: projectId, template_slug: slug, params });
  redirect(`/projects/${projectId}`);
}

async function addTicket(projectId: number, formData: FormData) {
  "use server";
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  ticketsRepo.create({
    project_id: projectId,
    title,
    body: String(formData.get("body") ?? ""),
    priority: (formData.get("priority") as TicketPriority) || "normal",
  });
  redirect(`/projects/${projectId}`);
}

async function setTicketStatus(ticketId: number, status: string, projectId: number) {
  "use server";
  ticketsRepo.setStatus(ticketId, status as Parameters<typeof ticketsRepo.setStatus>[1]);
  redirect(`/projects/${projectId}`);
}

async function addRevenue(projectId: number, formData: FormData) {
  "use server";
  const amount = Number(formData.get("amount") || 0);
  if (amount <= 0) return;
  const p = projectsRepo.get(projectId);
  const client = p?.client_id ? clientsRepo.get(p.client_id) : null;
  const kind = (formData.get("kind") as RevenueKind) || "project";
  const memo = String(formData.get("memo") ?? "");
  const id = revenueRepo.add({
    project_id: projectId,
    client_id: p?.client_id ?? null,
    kind,
    amount_cents: Math.round(amount * 100),
    memo,
  });
  const { record } = await import("@/lib/audit");
  record({ action: "revenue.add", entity: "revenue", entityId: id, payload: { amount, kind, project: p?.name } });
  const { notifyEventAsync } = await import("@/lib/wecom/notify");
  notifyEventAsync({
    kind: "revenue.add",
    revenue: { id, kind, amount_cents: Math.round(amount * 100), memo },
    project: p?.name,
    client: client?.company,
  });
  redirect(`/projects/${projectId}`);
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const p = projectsRepo.get(id);
  if (!p) notFound();
  const client = p.client_id ? clientsRepo.get(p.client_id) : null;
  const diagnostic = p.diagnostic_id ? diagnosticsRepo.get(p.diagnostic_id) : null;
  const deliverables = deliverablesRepo.list(id);
  const blueprints = blueprintsRepo.list(id);
  const tickets = ticketsRepo.list(id);
  const revenues = revenueRepo.list().filter((r) => r.project_id === id);
  const dataImports = businessDataImportsRepo.list(id);
  const packages = solutionPackagesRepo.list(id);
  const sows = sowRepo.list(id);
  const acceptances = acceptanceRecordsRepo.list(id);
  const totalRevenue = revenues.reduce((acc, r) => acc + r.amount_cents, 0);
  const update = updateProject.bind(null, id);
  const addDel = addDeliverable.bind(null, id);
  const addT = addTicket.bind(null, id);
  const addR = addRevenue.bind(null, id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={p.name}
        description={`客户：${client?.company ?? "—"}（${client?.industry ?? "—"}） · 启动 ${fmtDate(p.started_at)}`}
        action={
          <div className="flex gap-2">
            {diagnostic ? (
              <Link href={`/diagnostics/${diagnostic.id}`} className="rounded-md border border-forge-line bg-forge px-3 py-1.5 text-sm hover:bg-forge-line/60">
                诊断报告
              </Link>
            ) : null}
            <Link href="/projects" className="rounded-md bg-forge-line/60 px-3 py-1.5 text-sm hover:bg-forge-line">
              ← 列表
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">状态</div>
          <div className="mt-2"><Pill tone={p.status === "pilot" ? "accent" : p.status === "retainer" ? "success" : "neutral"}>{PROJECT_STATUS_LABELS[p.status]}</Pill></div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">项目费 / 月费</div>
          <div className="mt-2 text-base font-semibold text-ink-50">{fmtCents(p.project_fee_cents)} / {fmtCents(p.monthly_fee_cents)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">累计入账</div>
          <div className="mt-2 text-2xl font-semibold text-ink-50">{fmtCents(totalRevenue)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wider text-forge-muted">交付物 / 工单</div>
          <div className="mt-2 text-base text-ink-50">{deliverables.length} / {tickets.length}</div>
        </Card>
      </div>

      <Section title="项目元信息">
        <Card>
          <form action={update} className="grid gap-3 md:grid-cols-2">
            <Field label="项目名"><Input name="name" defaultValue={p.name} /></Field>
            <Field label="状态">
              <Select name="status" defaultValue={p.status}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
              </Select>
            </Field>
            <Field label="项目费（元）"><Input name="project_fee" type="number" min={0} defaultValue={p.project_fee_cents / 100} /></Field>
            <Field label="月费（元）"><Input name="monthly_fee" type="number" min={0} defaultValue={p.monthly_fee_cents / 100} /></Field>
            <div className="md:col-span-2">
              <Field label="备注 / 范围说明"><Textarea name="notes" defaultValue={p.notes} rows={3} /></Field>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
                保存
              </button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="交付物" description="从模板生成可下载的 zip">
        <Card>
          <form action={addDel} className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <Field label="选择模板">
                <Select name="template_slug" defaultValue={TEMPLATES[0]?.slug}>
                  {TEMPLATES.map((t) => <option key={t.slug} value={t.slug}>{t.name}（{t.slug}）</option>)}
                </Select>
              </Field>
            </div>
            <div className="md:col-span-3 text-xs text-forge-muted">
              使用模板默认参数；如需修改参数，可在下方填写（缺省则采用模板默认值）。
            </div>
            {/* Show params for the first template by default — server-rendered. Operators can edit on the deliverable page later. */}
            {TEMPLATES[0]?.params.map((p) => (
              <Field key={p.key} label={p.label}>
                <Input name={`p_${p.key}`} defaultValue={p.default} placeholder={p.hint} />
              </Field>
            ))}
            <div className="md:col-span-3 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
                + 添加交付物
              </button>
            </div>
          </form>
        </Card>
        <div className="mt-3 grid gap-2">
          {deliverables.map((d) => (
            <Link key={d.id} href={`/projects/${id}/deliverables/${d.id}`}>
              <Card className="cursor-pointer transition hover:border-accent-500">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-ink-50">{TEMPLATE_BY_SLUG[d.template_slug]?.name ?? d.template_slug}</div>
                    <div className="text-xs text-forge-muted">创建 {fmtDate(d.created_at)} · {d.bundle_path ? "已打包" : "未打包"}</div>
                  </div>
                  {d.bundle_path ? <Pill tone="success">{Math.round((d.bundle_size_bytes ?? 0) / 1024)} KB</Pill> : <Pill tone="warning">待打包</Pill>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="蓝图" description="项目相关的工作流蓝图">
        <div className="grid gap-2">
          {blueprints.length === 0 ? (
            <Card className="text-sm text-forge-muted">还没有蓝图。<Link href="/blueprints" className="ml-2 text-accent-400 hover:underline">去蓝图列表 →</Link></Card>
          ) : blueprints.map((bp) => (
            <Link key={bp.id} href={`/blueprints/${bp.id}`}>
              <Card className="cursor-pointer transition hover:border-accent-500">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-ink-50">{bp.name}</div>
                  <div className="text-xs text-forge-muted">最近更新 {fmtDate(bp.updated_at)}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </Section>

      <Section title="工单 Tickets">
        <Card>
          <form action={addT} className="grid gap-3 md:grid-cols-3">
            <Field label="标题"><Input name="title" placeholder="客户希望新增 XX 功能" /></Field>
            <Field label="优先级">
              <Select name="priority" defaultValue="normal">
                <option value="low">低</option>
                <option value="normal">中</option>
                <option value="high">高</option>
                <option value="urgent">紧急</option>
              </Select>
            </Field>
            <Field label="详情"><Input name="body" placeholder="客户原话或排查记录" /></Field>
            <div className="md:col-span-3 flex justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
                + 工单
              </button>
            </div>
          </form>
        </Card>
        <div className="mt-3 grid gap-2">
          {tickets.map((t) => (
            <Card key={t.id} className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink-50">{t.title}</div>
                <div className="mt-0.5 text-xs text-forge-muted">{fmtDate(t.opened_at)} · 优先级 {t.priority}</div>
                {t.body ? <div className="mt-2 text-xs text-ink-200">{t.body}</div> : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Pill tone={t.status === "open" ? "warning" : t.status === "resolved" || t.status === "closed" ? "success" : "accent"}>
                  {t.status}
                </Pill>
                {t.status !== "closed" ? (
                  <form action={setTicketStatus.bind(null, t.id, t.status === "open" ? "in_progress" : "resolved", id)}>
                    <button className="rounded-md bg-forge-line/60 px-2 py-1 text-xs hover:bg-forge-line">
                      → {t.status === "open" ? "处理中" : "已解决"}
                    </button>
                  </form>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="交付 OS" description="数据导入 → 方案包 → SOW → 验收全流程">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Data Imports */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-forge-muted">数据导入</span>
              <Link href={`/data-imports/new`} className="rounded bg-forge-line/60 px-2 py-0.5 text-xs hover:bg-forge-line">+ 新建</Link>
            </div>
            {dataImports.length === 0 ? (
              <Card className="text-sm text-forge-muted">暂无数据导入</Card>
            ) : dataImports.map((imp) => (
              <Link key={imp.id} href={`/data-imports/${imp.id}`}>
                <Card className="cursor-pointer transition hover:border-accent-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-50">{imp.filename}</div>
                      <div className="text-xs text-forge-muted">{imp.row_count} 行 · {imp.source_type.toUpperCase()} · {imp.created_at.slice(0, 10)}</div>
                    </div>
                    <Pill tone="neutral">导入</Pill>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Solution Packages */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-forge-muted">方案包</span>
            </div>
            {packages.length === 0 ? (
              <Card className="text-sm text-forge-muted">暂无方案包{dataImports.length > 0 ? <>，<Link href={`/data-imports/${dataImports[0].id}`} className="text-accent-400 hover:underline">从导入生成</Link></> : ""}</Card>
            ) : packages.map((pkg) => (
              <Link key={pkg.id} href={`/solution-packages/${pkg.id}`}>
                <Card className="cursor-pointer transition hover:border-accent-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-50">{pkg.name}</div>
                      <div className="text-xs text-forge-muted">{pkg.template_slug ?? "—"} · v{pkg.version}</div>
                    </div>
                    <Pill tone="accent">方案</Pill>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* SOWs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-forge-muted">工作说明书 SOW</span>
            </div>
            {sows.length === 0 ? (
              <Card className="text-sm text-forge-muted">暂无 SOW{packages.length > 0 ? <>，<Link href={`/solution-packages/${packages[0].id}`} className="text-accent-400 hover:underline">从方案包生成</Link></> : ""}</Card>
            ) : sows.map((sow) => (
              <Link key={sow.id} href={`/sow/${sow.id}`}>
                <Card className="cursor-pointer transition hover:border-accent-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-50">¥{(sow.price_cents / 100).toLocaleString()} · {sow.timeline_weeks}周</div>
                      <div className="text-xs text-forge-muted">{sow.created_at.slice(0, 10)}</div>
                    </div>
                    <Pill tone={sow.customer_approval_status === "approved" ? "success" : "warning"}>
                      {sow.customer_approval_status === "approved" ? "已确认" : "待确认"}
                    </Pill>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Acceptance Records */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-forge-muted">验收记录</span>
              <Link href={`/projects/${id}/acceptance`} className="rounded bg-forge-line/60 px-2 py-0.5 text-xs hover:bg-forge-line">管理</Link>
            </div>
            {acceptances.length === 0 ? (
              <Card className="text-sm text-forge-muted">暂无验收记录</Card>
            ) : acceptances.map((ar) => (
              <Card key={ar.id}>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-ink-100">验收 #{ar.id}</div>
                  <Pill tone={ar.signoff_status === "signed" ? "success" : "warning"}>
                    {ar.signoff_status === "signed" ? "已签署" : "待签署"}
                  </Pill>
                </div>
                {ar.customer_confirmed_at && (
                  <div className="mt-1 text-xs text-forge-muted">签署于 {ar.customer_confirmed_at.slice(0, 10)}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section title="收入 Revenue">
        <Card>
          <form action={addR} className="grid gap-3 md:grid-cols-4">
            <Field label="类型">
              <Select name="kind" defaultValue="project">
                {REVENUE_KINDS.map((k) => <option key={k} value={k}>{REVENUE_KIND_LABELS[k]}</option>)}
              </Select>
            </Field>
            <Field label="金额（元）"><Input name="amount" type="number" min={0} placeholder="20000" /></Field>
            <Field label="备注"><Input name="memo" placeholder="试点项目首期 50%" /></Field>
            <div className="flex items-end justify-end">
              <button type="submit" className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400">
                + 记账
              </button>
            </div>
          </form>
        </Card>
        <div className="mt-3 grid gap-2">
          {revenues.map((r) => (
            <Card key={r.id} className="flex items-center justify-between">
              <div className="text-sm">
                <Pill tone="accent">{REVENUE_KIND_LABELS[r.kind]}</Pill>
                <span className="ml-3 text-ink-100">{r.memo || "—"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-forge-muted">{fmtDate(r.paid_at)}</span>
                <span className="font-semibold text-ink-50">{fmtCents(r.amount_cents)}</span>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
