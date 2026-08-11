import { redirect } from "next/navigation";
import { ProductForm } from "@/components/masters/ProductForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function NewProductPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!ROLE_PERMISSIONS[ctx.profile.role].canManageMasters) redirect("/products");

  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Add Product
      </h2>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <ProductForm companies={ctx.companies} />
      </div>
    </div>
  );
}
