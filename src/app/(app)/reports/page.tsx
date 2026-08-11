import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getPerformanceReports } from "@/lib/sales/analytics";
import { listSales } from "@/lib/sales/actions";
import Link from "next/link";

export default async function ReportsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (
    !["OWNER", "ADMIN", "SALES_MANAGER", "ACCOUNTANT", "VIEWER"].includes(
      ctx.profile.role
    )
  ) {
    redirect("/dashboard");
  }

  const reports = await getPerformanceReports(ctx.selectedCompanyIds);
  const recentSales = await listSales({
    companyIds: ctx.selectedCompanyIds,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Management Reports
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Month {reports.month} · Sales ₹
          {reports.totals.salesValue.toLocaleString("en-IN")} · Visits{" "}
          {reports.totals.visits} · Incentives ₹
          {reports.totals.incentives.toLocaleString("en-IN")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Link className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" href="/intervention">
          Owner Intervention
        </Link>
        <Link className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" href="/sales">
          Party / Product / Salesman Sales
        </Link>
        <Link className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" href="/incentives">
          Incentive Report
        </Link>
        <Link className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4" href="/settings/targets">
          Target vs Achievement
        </Link>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">1. Salesman Performance</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Salesman</th>
                <th className="py-2 pr-3">Visits</th>
                <th className="py-2 pr-3">Sales</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Ach %</th>
                <th className="py-2 pr-3">Incentive</th>
                <th className="py-2">Flag</th>
              </tr>
            </thead>
            <tbody>
              {reports.salesmanPerf.map((s) => (
                <tr key={s.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">{s.name}</td>
                  <td className="py-2 pr-3">{s.visits}</td>
                  <td className="py-2 pr-3">
                    ₹{s.salesValue.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 pr-3">
                    ₹{s.target.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 pr-3">{s.achievement.toFixed(1)}%</td>
                  <td className="py-2 pr-3">
                    ₹{s.incentive.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 text-xs font-medium">{s.flag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">2. Product Performance</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Visits</th>
                <th className="py-2 pr-3">Samples</th>
                <th className="py-2 pr-3">Conversions</th>
                <th className="py-2">Sales</th>
              </tr>
            </thead>
            <tbody>
              {reports.productPerf.map((p) => (
                <tr key={p.id} className="border-t border-[var(--border)]">
                  <td className="py-2 pr-3">{p.product_name}</td>
                  <td className="py-2 pr-3">{p.visits}</td>
                  <td className="py-2 pr-3">{p.samples}</td>
                  <td className="py-2 pr-3">{p.conversions}</td>
                  <td className="py-2">
                    ₹{p.salesValue.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">3–6. Party / Product / Salesman-wise sales</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {recentSales.slice(0, 20).map((s) => (
            <li key={s.id} className="flex justify-between gap-3 border-b border-[var(--border)] py-2">
              <span>
                {s.sale_date} · {s.party?.party_name} · {s.product?.product_name} ·{" "}
                {s.salesman?.name}
              </span>
              <span className="font-medium">
                ₹{Number(s.sales_value).toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">7–12. Decision support reports</h3>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li>Target vs Achievement — see salesman table above</li>
          <li>
            Incentive Report —{" "}
            <Link href="/incentives" className="text-[var(--accent)] hover:underline">
              open incentives
            </Link>
          </li>
          <li>
            Visit vs Conversion / Sample vs Conversion / Follow-up vs Conversion —{" "}
            <Link href="/intervention" className="text-[var(--accent)] hover:underline">
              intervention + Party 360
            </Link>
          </li>
          <li>
            Dormant / ignored parties — severity GREY on{" "}
            <Link href="/intervention" className="text-[var(--accent)] hover:underline">
              Owner Intervention
            </Link>
          </li>
          <li>High visits + no sales — RED intervention</li>
          <li>Sample given + no conversion — AMBER intervention</li>
          <li>Product started + low/no recent sales — BLUE intervention</li>
          <li>Salesmen best / under target — Flag column in salesman performance</li>
        </ul>
      </section>
    </div>
  );
}
