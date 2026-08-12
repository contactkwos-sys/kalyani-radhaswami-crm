import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { upsertSalesmanTarget } from "@/lib/sales/actions";
import { createClient } from "@/lib/supabase/server";

export default async function TargetsSettingsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(ctx.profile.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data: salesmen } = await supabase
    .from("crm_salesmen")
    .select("id, name, company_id, monthly_target, party_development_target, status")
    .in("company_id", ctx.selectedCompanyIds)
    .eq("status", "ACTIVE")
    .order("name");

  const { data: months } = await supabase
    .from("crm_salesman_targets")
    .select("id, salesman_id, year_month, sales_target, party_development_target")
    .in("company_id", ctx.selectedCompanyIds)
    .order("year_month", { ascending: false })
    .limit(40);

  async function saveTarget(formData: FormData) {
    "use server";
    const salesmanId = String(formData.get("salesman_id") ?? "");
    const companyId = String(formData.get("company_id") ?? "");
    const month = String(formData.get("month") ?? "");
    const salesTarget = Number(formData.get("sales_target") ?? 0);
    const partyDev = Number(formData.get("party_development_target") ?? 0);
    await upsertSalesmanTarget({
      salesman_id: salesmanId,
      company_id: companyId,
      year_month: month,
      sales_target: salesTarget,
      party_development_target: partyDev,
    });
    redirect("/settings/targets");
  }

  const defaultMonth = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/company" className="text-sm text-[var(--accent)] hover:underline">
          ← Settings
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Monthly targets
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure salesman sales and party-development targets.
        </p>
      </div>

      <form
        action={saveTarget}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2"
      >
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Salesman</span>
          <select name="salesman_id" required className={field}>
            <option value="">Select</option>
            {(salesmen ?? []).map((s) => {
              const company = ctx.companies.find((c) => c.id === s.company_id);
              return (
                <option key={s.id} value={s.id}>
                  {s.name} · {company?.code} · default ₹
                  {Number(s.monthly_target).toLocaleString("en-IN")}
                </option>
              );
            })}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Company</span>
          <select name="company_id" required className={field}>
            {ctx.companies
              .filter((c) => ctx.selectedCompanyIds.includes(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Month</span>
          <input
            name="month"
            type="month"
            required
            defaultValue={defaultMonth}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Sales target (₹)</span>
          <input
            name="sales_target"
            type="number"
            min={0}
            step="0.01"
            required
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Party development target</span>
          <input
            name="party_development_target"
            type="number"
            min={0}
            defaultValue={0}
            className={field}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Save target
          </button>
        </div>
      </form>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Recent targets
        </h3>
        <ul className="mt-3 space-y-2">
          {(months ?? []).map((t) => {
            const sm = (salesmen ?? []).find((s) => s.id === t.salesman_id);
            return (
              <li
                key={t.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <p className="font-medium">
                  {sm?.name ?? "Salesman"} · {t.year_month}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Sales ₹{Number(t.sales_target).toLocaleString("en-IN")} · Party
                  development {t.party_development_target}
                </p>
              </li>
            );
          })}
          {(months ?? []).length === 0 && (
            <li className="text-sm text-[var(--muted)]">No monthly overrides yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
