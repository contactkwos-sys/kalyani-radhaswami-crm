import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { listProducts } from "@/lib/masters/actions";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function ProductsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const products = await listProducts(ctx.selectedCompanyIds);
  const canManage = ROLE_PERMISSIONS[ctx.profile.role].canManageMasters;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Product Master
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {products.length} products · scoped to selected company
          </p>
        </div>
        {canManage && (
          <Link
            href="/products/new"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Add Product
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Incentive %</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/products/${p.id}`} className="font-medium text-[var(--accent)] hover:underline">
                    {p.product_code}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.product_name}</td>
                <td className="px-4 py-3">{p.company?.name}</td>
                <td className="px-4 py-3">₹{Number(p.sales_rate).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">{p.incentive_percent}%</td>
                <td className="px-4 py-3">{p.status}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
