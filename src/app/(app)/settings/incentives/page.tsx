import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import {
  listIncentiveRules,
  upsertIncentiveRule,
} from "@/lib/sales/development";
import { listProducts } from "@/lib/masters/actions";

export default async function IncentiveSettingsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "ADMIN"].includes(ctx.profile.role)) redirect("/dashboard");

  const [rules, products] = await Promise.all([
    listIncentiveRules(ctx.selectedCompanyIds),
    listProducts(ctx.selectedCompanyIds),
  ]);

  async function saveRule(formData: FormData) {
    "use server";
    const companyId = String(formData.get("company_id") ?? "");
    const name = String(formData.get("name") ?? "");
    const ruleType = String(formData.get("rule_type") ?? "PERCENT_OF_SALES");
    const percent = formData.get("percent_rate");
    const fixed = formData.get("fixed_amount");
    const productId = String(formData.get("product_id") ?? "") || null;
    const slabsRaw = String(formData.get("slabs") ?? "[]");
    let slabs: Array<{ min_pct: number; max_pct: number; rate: number }> = [];
    try {
      slabs = JSON.parse(slabsRaw);
    } catch {
      slabs = [];
    }
    await upsertIncentiveRule({
      company_id: companyId,
      name,
      rule_type: ruleType as
        | "PERCENT_OF_SALES"
        | "FIXED_PER_QTY"
        | "FIXED_PER_CONVERTED_PARTY"
        | "PRODUCT_SPECIFIC"
        | "TARGET_SLAB",
      product_id: productId,
      percent_rate: percent === "" || percent == null ? null : Number(percent),
      fixed_amount: fixed === "" || fixed == null ? null : Number(fixed),
      slabs,
      is_active: true,
      priority: Number(formData.get("priority") ?? 100),
      notes: String(formData.get("notes") ?? "") || null,
    });
    redirect("/settings/incentives");
  }

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";
  const defaultSlabs = JSON.stringify(
    [
      { min_pct: 0, max_pct: 80, rate: 0 },
      { min_pct: 80, max_pct: 100, rate: 1 },
      { min_pct: 100, max_pct: 120, rate: 1.5 },
      { min_pct: 120, max_pct: 9999, rate: 2 },
    ],
    null,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/company" className="text-sm text-[var(--accent)] hover:underline">
          ← Settings
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Incentive rules
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configurable engine — percent, fixed, product-specific, and target slabs.
        </p>
      </div>

      <form
        action={saveRule}
        className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-2"
      >
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
          <span className="text-[var(--muted)]">Rule type</span>
          <select name="rule_type" required className={field} defaultValue="TARGET_SLAB">
            <option value="PERCENT_OF_SALES">Percentage of sales value</option>
            <option value="FIXED_PER_QTY">Fixed amount per quantity</option>
            <option value="FIXED_PER_CONVERTED_PARTY">
              Fixed amount per converted party
            </option>
            <option value="PRODUCT_SPECIFIC">Product-specific incentive</option>
            <option value="TARGET_SLAB">Target slab incentive</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Name</span>
          <input name="name" required className={field} placeholder="Rule name" />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Product (optional)</span>
          <select name="product_id" className={field} defaultValue="">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Priority (lower = first)</span>
          <input name="priority" type="number" defaultValue={100} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Percent rate</span>
          <input name="percent_rate" type="number" step="0.01" className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Fixed amount</span>
          <input name="fixed_amount" type="number" step="0.01" className={field} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Slabs JSON (TARGET_SLAB)</span>
          <textarea
            name="slabs"
            rows={4}
            defaultValue={defaultSlabs}
            className={field}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted)]">Notes</span>
          <input name="notes" className={field} />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Add incentive rule
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Active rules</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="border-b border-[var(--border)] pb-3 last:border-0">
              <p className="font-medium">
                {r.name}{" "}
                <span className="text-xs text-[var(--muted)]">
                  · {r.rule_type} · priority {r.priority}
                  {r.is_active ? "" : " · inactive"}
                </span>
              </p>
              <p className="text-[var(--muted)]">
                {r.percent_rate != null ? `${r.percent_rate}% · ` : ""}
                {r.fixed_amount != null
                  ? `₹${Number(r.fixed_amount).toLocaleString("en-IN")} · `
                  : ""}
                {Array.isArray(r.slabs) && r.slabs.length
                  ? `slabs: ${r.slabs.map((s) => `${s.min_pct}-${s.max_pct}%→${s.rate}%`).join(", ")}`
                  : ""}
              </p>
            </li>
          ))}
          {rules.length === 0 && (
            <li className="text-[var(--muted)]">No rules configured.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
