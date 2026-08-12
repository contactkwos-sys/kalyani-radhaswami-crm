import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { confirmIncentives } from "@/lib/sales/actions";
import { createClient } from "@/lib/supabase/server";

export default async function IncentivesPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }

  const canConfirm = ["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(ctx.profile.role);
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);

  const supabase = await createClient();
  let q = supabase
    .from("crm_incentive_calculations")
    .select(
      "*, salesman:crm_salesmen(id,name), product:crm_products(product_name), sale:crm_sales(invoice_number,sale_date)"
    )
    .in("company_id", ctx.selectedCompanyIds)
    .eq("year_month", month)
    .order("created_at", { ascending: false })
    .limit(200);

  // Salesmen only see their own incentives
  if (ctx.profile.role === "SALESMAN") {
    const { data: sm } = await supabase
      .from("crm_salesmen")
      .select("id")
      .eq("user_id", ctx.profile.id)
      .maybeSingle();
    if (!sm) redirect("/dashboard");
    q = q.eq("salesman_id", sm.id);
  }

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const estimated = (rows || [])
    .filter((r) => r.status === "ESTIMATED")
    .reduce((a, r) => a + Number(r.calculated_amount), 0);
  const confirmed = (rows || [])
    .filter((r) => r.status === "CONFIRMED" || r.status === "PAID")
    .reduce((a, r) => a + Number(r.calculated_amount), 0);

  async function confirmForSalesman(formData: FormData) {
    "use server";
    const salesmanId = String(formData.get("salesman_id") ?? "");
    const yearMonth = String(formData.get("year_month") ?? "");
    await confirmIncentives(salesmanId, yearMonth);
    redirect("/incentives");
  }

  const bySalesman = new Map<string, { name: string; estimated: number; confirmed: number }>();
  for (const r of rows || []) {
    const sm = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
    const key = r.salesman_id;
    const cur = bySalesman.get(key) || {
      name: sm?.name || "Salesman",
      estimated: 0,
      confirmed: 0,
    };
    if (r.status === "ESTIMATED") cur.estimated += Number(r.calculated_amount);
    if (r.status === "CONFIRMED" || r.status === "PAID")
      cur.confirmed += Number(r.calculated_amount);
    bySalesman.set(key, cur);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Incentives
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Month {month} · Sales value → rate → calculated → confirmed
          </p>
        </div>
        {canConfirm && (
          <Link
            href="/settings/incentives"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            Configure rules
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Estimated incentive
          </p>
          <p className="mt-1 text-2xl font-semibold">
            ₹{estimated.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Confirmed incentive
          </p>
          <p className="mt-1 text-2xl font-semibold">
            ₹{confirmed.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {canConfirm && bySalesman.size > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Confirm by salesman</h3>
          <ul className="mt-3 space-y-3">
            {[...bySalesman.entries()].map(([id, s]) => (
              <li
                key={id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-[var(--muted)]">
                    Est ₹{s.estimated.toLocaleString("en-IN")} · Conf ₹
                    {s.confirmed.toLocaleString("en-IN")}
                  </p>
                </div>
                {s.estimated > 0 && (
                  <form action={confirmForSalesman}>
                    <input type="hidden" name="salesman_id" value={id} />
                    <input type="hidden" name="year_month" value={month} />
                    <button
                      type="submit"
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      Confirm estimates
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Salesman</th>
              <th className="px-3 py-3">Product / Invoice</th>
              <th className="px-3 py-3">Sales value</th>
              <th className="px-3 py-3">Rate</th>
              <th className="px-3 py-3">Calculated</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const sm = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              const prod = Array.isArray(r.product) ? r.product[0] : r.product;
              const sale = Array.isArray(r.sale) ? r.sale[0] : r.sale;
              return (
                <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-3 py-3">{sm?.name}</td>
                  <td className="px-3 py-3">
                    {prod?.product_name || "—"}
                    {sale?.invoice_number ? ` · ${sale.invoice_number}` : ""}
                    <div className="text-xs text-[var(--muted)]">
                      {r.calculation_notes}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    ₹{Number(r.sales_value).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3">
                    {r.incentive_rate != null ? `${r.incentive_rate}%` : "—"}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    ₹{Number(r.calculated_amount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3">{r.status}</td>
                </tr>
              );
            })}
            {(rows || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--muted)]">
                  No incentive calculations for this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
