import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { listSales } from "@/lib/sales/actions";

export default async function SalesPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }

  const canEnter = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(ctx.profile.role);
  const sales = await listSales({ companyIds: ctx.selectedCompanyIds });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Sales
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Accountant-entered actual sales · {sales.length} records
          </p>
        </div>
        {canEnter && (
          <Link
            href="/sales/new"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Enter Sales
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Invoice</th>
              <th className="px-3 py-3">Party</th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Salesman</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Value</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-3 py-3">{s.sale_date}</td>
                <td className="px-3 py-3">{s.invoice_number || "—"}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/parties/${s.party_id}/360`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {s.party?.party_name}
                  </Link>
                </td>
                <td className="px-3 py-3">{s.product?.product_name}</td>
                <td className="px-3 py-3">{s.salesman?.name}</td>
                <td className="px-3 py-3">{Number(s.quantity)}</td>
                <td className="px-3 py-3 font-medium">
                  ₹{Number(s.sales_value).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[var(--muted)]">
                  No sales yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!canEnter && (
        <p className="text-sm text-[var(--muted)]">
          Salesman view is read-only. Accountant-entered sales cannot be edited here.
        </p>
      )}
    </div>
  );
}
