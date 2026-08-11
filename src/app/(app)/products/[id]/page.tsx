import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductForm } from "@/components/masters/ProductForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getProduct } from "@/lib/masters/actions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const product = await getProduct(id);
  if (!product) notFound();

  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("crm_salesman_products")
    .select("*, salesman:crm_salesmen(id,name,employee_id)")
    .eq("product_id", id)
    .eq("is_active", true);

  const canManage = ROLE_PERMISSIONS[ctx.profile.role].canManageMasters;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/products" className="text-sm text-[var(--accent)] hover:underline">
            ← Products
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            {product.product_name}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {product.product_code} · {product.company?.name}
          </p>
        </div>
      </div>

      {canManage ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <ProductForm companies={ctx.companies} product={product} />
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Rate</dt>
              <dd className="font-medium">₹{Number(product.sales_rate).toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Incentive</dt>
              <dd className="font-medium">{product.incentive_percent}%</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Target</dt>
              <dd className="font-medium">₹{Number(product.monthly_target).toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Status</dt>
              <dd className="font-medium">{product.status}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="font-semibold">Assigned Salesmen</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(assignments || []).map((a: { id: string; salesman?: { name: string; employee_id: string } | null }) => (
            <li key={a.id}>
              {a.salesman?.name} ({a.salesman?.employee_id})
            </li>
          ))}
          {(assignments || []).length === 0 && (
            <li className="text-[var(--muted)]">No salesmen assigned.</li>
          )}
        </ul>
        {canManage && (
          <Link href="/assignments" className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline">
            Manage assignments →
          </Link>
        )}
      </div>
    </div>
  );
}
