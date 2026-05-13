import { redirect } from "next/navigation";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { clientsRepo } from "@/lib/repo";
import { record } from "@/lib/audit";

async function createClient(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  if (!name || !company) return;
  const c = clientsRepo.create({
    name,
    company,
    industry: String(formData.get("industry") ?? "").trim(),
    size: String(formData.get("size") ?? "").trim() || "未填写",
    contact: String(formData.get("contact") ?? "").trim(),
    billing_email: String(formData.get("billing_email") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  record({ action: "client.create", entity: "client", entityId: c.id });
  redirect(`/clients/${c.id}`);
}

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="新建客户" description="把已成交的线索沉淀为正式客户名册。" />
      <Card>
        <form action={createClient} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="联系人 *"><Input name="name" required /></Field>
            <Field label="公司 *"><Input name="company" required /></Field>
            <Field label="行业"><Input name="industry" /></Field>
            <Field label="规模"><Input name="size" placeholder="30 人 / 年营收 4000 万" /></Field>
            <Field label="联系方式"><Input name="contact" placeholder="微信 / 手机 / 邮箱" /></Field>
            <Field label="开票邮箱"><Input name="billing_email" type="email" /></Field>
          </div>
          <Field label="备注 / 决策链信息"><Textarea name="notes" rows={3} /></Field>
          <div className="flex justify-end">
            <button type="submit" className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium text-forge hover:bg-accent-400">
              保存
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
