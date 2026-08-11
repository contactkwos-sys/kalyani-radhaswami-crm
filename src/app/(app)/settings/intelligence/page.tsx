import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import {
  getIntelligenceSettings,
  upsertIntelligenceSettings,
} from "@/lib/intelligence/settings";

export default async function IntelligenceSettingsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "ADMIN"].includes(ctx.profile.role)) redirect("/dashboard");

  const companyId =
    ctx.selectedCompanyIds.length === 1 ? ctx.selectedCompanyIds[0] : null;
  const settings = await getIntelligenceSettings(companyId);

  async function save(formData: FormData) {
    "use server";
    const company = String(formData.get("company_id") || "") || null;
    await upsertIntelligenceSettings({
      company_id: company,
      inactive_days: Number(formData.get("inactive_days")),
      high_visits_no_sales: Number(formData.get("high_visits_no_sales")),
      single_visit_ignore_days: Number(formData.get("single_visit_ignore_days")),
      sample_no_followup_days: Number(formData.get("sample_no_followup_days")),
      high_potential_value: Number(formData.get("high_potential_value")),
      high_potential_min_visits: Number(
        formData.get("high_potential_min_visits")
      ),
      product_started_stale_days: Number(
        formData.get("product_started_stale_days")
      ),
      hot_min_visits: Number(formData.get("hot_min_visits")),
      hot_max_days_since_visit: Number(formData.get("hot_max_days_since_visit")),
      warm_max_days_since_visit: Number(
        formData.get("warm_max_days_since_visit")
      ),
      cold_max_days_since_visit: Number(
        formData.get("cold_max_days_since_visit")
      ),
      active_customer_min_sales: Number(
        formData.get("active_customer_min_sales")
      ),
      inactive_customer_days: Number(formData.get("inactive_customer_days")),
    });
    redirect("/settings/intelligence");
  }

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  const fields: Array<[string, string, number]> = [
    ["inactive_days", "Days without visit = ignored/inactive", settings.inactive_days],
    ["high_visits_no_sales", "High visits with zero sales", settings.high_visits_no_sales],
    ["single_visit_ignore_days", "Single visit then ignored (days)", settings.single_visit_ignore_days],
    ["sample_no_followup_days", "Sample with no follow-up (days)", settings.sample_no_followup_days],
    ["high_potential_value", "High potential value (₹)", settings.high_potential_value],
    ["high_potential_min_visits", "High potential min visits", settings.high_potential_min_visits],
    ["product_started_stale_days", "Product started stale (days)", settings.product_started_stale_days],
    ["hot_min_visits", "HOT: min visits", settings.hot_min_visits],
    ["hot_max_days_since_visit", "HOT: max days since visit", settings.hot_max_days_since_visit],
    ["warm_max_days_since_visit", "WARM: max days since visit", settings.warm_max_days_since_visit],
    ["cold_max_days_since_visit", "COLD: max days since visit", settings.cold_max_days_since_visit],
    ["active_customer_min_sales", "Active customer min sales", settings.active_customer_min_sales],
    ["inactive_customer_days", "Inactive customer days", settings.inactive_customer_days],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/company" className="text-sm text-[var(--accent)] hover:underline">
          ← Settings
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Intelligence thresholds
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configurable Owner alert and classification rules (not hard-coded).
        </p>
      </div>

      <form
        action={save}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2"
      >
        <input type="hidden" name="company_id" value={companyId || ""} />
        {fields.map(([name, label, value]) => (
          <label key={name} className="block text-sm">
            <span className="text-[var(--muted)]">{label}</span>
            <input
              name={name}
              type="number"
              min={0}
              step="any"
              required
              defaultValue={value}
              className={field}
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Save thresholds
          </button>
        </div>
      </form>
    </div>
  );
}
