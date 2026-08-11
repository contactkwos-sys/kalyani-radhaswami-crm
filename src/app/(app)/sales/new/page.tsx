import { redirect } from "next/navigation";
import { SalesEntryForm } from "@/components/sales/SalesEntryForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { listParties, listProducts, listSalesmen } from "@/lib/masters/actions";

export default async function NewSalesPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.profile.role)) {
    redirect("/sales");
  }

  const [products, parties, salesmen] = await Promise.all([
    listProducts(ctx.selectedCompanyIds),
    listParties(ctx.selectedCompanyIds),
    listSalesmen(ctx.selectedCompanyIds),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Accountant Sales Entry
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter multiple daily sales quickly. Sales become visible to assigned salesmen
          immediately.
        </p>
      </div>
      <SalesEntryForm
        companies={ctx.companies.filter((c) =>
          ctx.selectedCompanyIds.includes(c.id)
        )}
        products={products}
        parties={parties}
        salesmen={salesmen}
      />
    </div>
  );
}
