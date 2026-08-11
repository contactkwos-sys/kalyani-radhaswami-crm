import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { listParties } from "@/lib/masters/actions";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function PartiesPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const parties = await listParties(ctx.selectedCompanyIds);
  const canAdd =
    ROLE_PERMISSIONS[ctx.profile.role].canManageMasters ||
    ctx.profile.role === "SALESMAN" ||
    ctx.profile.role === "SALES_MANAGER";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Party Master
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {parties.length} parties · supports 500+
          </p>
        </div>
        {canAdd && (
          <Link
            href="/parties/new"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Add Party
          </Link>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Area / City</th>
              <th className="px-4 py-3">Potential</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">History</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/parties/${p.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {p.party_code}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.party_name}</td>
                <td className="px-4 py-3">
                  {[p.area, p.city].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  ₹{Number(p.potential_monthly_business).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/parties/${p.id}#history`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    VIEW COMPLETE HISTORY
                  </Link>
                </td>
              </tr>
            ))}
            {parties.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                  No parties yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
