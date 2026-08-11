import { redirect } from "next/navigation";
import { AssignmentPanel } from "@/components/masters/AssignmentPanel";
import { getActiveCompanyContext } from "@/lib/masters/context";
import {
  listParties,
  listProducts,
  listSalesmen,
} from "@/lib/masters/actions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function AssignmentsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!ROLE_PERMISSIONS[ctx.profile.role].canManageMasters) {
    redirect("/dashboard");
  }

  const [products, salesmen, parties] = await Promise.all([
    listProducts(ctx.selectedCompanyIds),
    listSalesmen(ctx.selectedCompanyIds),
    listParties(ctx.selectedCompanyIds),
  ]);

  const supabase = await createClient();
  const [{ data: salesmanProducts }, { data: partySalesmen }] = await Promise.all([
    supabase
      .from("crm_salesman_products")
      .select("*, salesman:crm_salesmen(name), product:crm_products(product_name)")
      .in("company_id", ctx.selectedCompanyIds)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("crm_party_salesmen")
      .select(
        "*, party:crm_parties(party_name), salesman:crm_salesmen(name), product:crm_products(product_name)"
      )
      .in("company_id", ctx.selectedCompanyIds)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Assignments
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Party → Product → Salesman. Multiple salesmen per product are supported.
        </p>
      </div>
      <AssignmentPanel
        companies={ctx.companies}
        products={products}
        salesmen={salesmen}
        parties={parties}
        salesmanProducts={salesmanProducts || []}
        partySalesmen={partySalesmen || []}
      />
    </div>
  );
}
