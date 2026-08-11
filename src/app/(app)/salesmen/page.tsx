import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { listSalesmen } from "@/lib/masters/actions";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function SalesmenPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const salesmen = await listSalesmen(ctx.selectedCompanyIds);
  const canManage = ROLE_PERMISSIONS[ctx.profile.role].canManageMasters;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Salesman Master
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {salesmen.length} salesmen
          </p>
        </div>
        {canManage && (
          <Link
            href="/salesmen/new"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Add Salesman
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Monthly Target</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {salesmen.map((s) => (
              <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/salesmen/${s.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {s.employee_id}
                  </Link>
                </td>
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">{s.company?.name}</td>
                <td className="px-4 py-3">{s.mobile || "—"}</td>
                <td className="px-4 py-3">
                  ₹{Number(s.monthly_target).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">{s.status}</td>
              </tr>
            ))}
            {salesmen.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No salesmen yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
