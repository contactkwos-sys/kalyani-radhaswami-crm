import { redirect } from "next/navigation";
import { SalesmanForm } from "@/components/masters/SalesmanForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";
import type { Territory } from "@/types/masters";

export default async function NewSalesmanPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!ROLE_PERMISSIONS[ctx.profile.role].canManageMasters) redirect("/salesmen");

  const supabase = await createClient();
  const { data: territories } = await supabase
    .from("crm_territories")
    .select("*")
    .in("company_id", ctx.companies.map((c) => c.id))
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Add Salesman
      </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <SalesmanForm
          companies={ctx.companies}
          territories={(territories || []) as Territory[]}
        />
      </div>
    </div>
  );
}
