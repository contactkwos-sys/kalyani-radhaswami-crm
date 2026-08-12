import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getReportContext } from "@/lib/intelligence/context";
import { getSalesmanPerformance } from "@/lib/intelligence/performance";

export default async function SalesmanPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  let ctx;
  try {
    ctx = await getReportContext(sp);
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const rows = await getSalesmanPerformance(ctx.filters);
  const ranked = [...rows].sort((a, b) => b.achievementPct - a.achievementPct);
  const top = ranked.slice(0, 5);
  const low = [...ranked].reverse().slice(0, 5);
  const compareA = typeof sp.compareA === "string" ? sp.compareA : "";
  const compareB = typeof sp.compareB === "string" ? sp.compareB : "";
  const a = rows.find((r) => r.id === compareA);
  const b = rows.find((r) => r.id === compareB);

  const csvRows = rows.map((r) => ({
    name: r.name,
    products: r.products.join("; "),
    assigned_parties: r.assignedParties,
    planned_visits: r.plannedVisits,
    actual_visits: r.actualVisits,
    gps_verified: r.gpsVerifiedVisits,
    visit_hours: Math.round((r.totalVisitSeconds / 3600) * 10) / 10,
    avg_minutes_per_party: Math.round(r.avgTimePerParty / 60),
    followups: r.followups,
    samples_given: r.samplesGiven,
    samples_converted: r.samplesConverted,
    sales: r.salesAmount,
    target: r.target,
    achievement_pct: Math.round(r.achievementPct * 10) / 10,
    incentive: r.incentive,
    new_parties: r.newParties,
    converted: r.convertedParties,
    non_converted: r.nonConvertedParties,
    last_visit: r.lastVisitDate,
    next_followup: r.nextFollowupDate,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Salesman Performance
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton filename="salesman-performance.csv" rows={csvRows} />
        </div>
      </div>

      <ReportFiltersBar
        companies={ctx.companies.filter((c) =>
          ctx.selectedCompanyIds.includes(c.id)
        )}
        products={ctx.products}
        salesmen={ctx.salesmen}
        parties={ctx.parties}
        defaults={{
          from: ctx.filters.from,
          to: ctx.filters.to,
          salesman: ctx.filters.salesmanId || "",
          product: ctx.filters.productId || "",
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <RankCard title="Top performing salesmen" rows={top} />
        <RankCard title="Lowest performing salesmen" rows={low} />
      </div>

      <form className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm print:hidden">
        <span className="font-medium">Compare:</span>
        <select name="compareA" defaultValue={compareA} className="rounded-md border px-2 py-1">
          <option value="">Salesman A</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select name="compareB" defaultValue={compareB} className="rounded-md border px-2 py-1">
          <option value="">Salesman B</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1 text-white">
          Compare
        </button>
      </form>

      {a && b && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="font-semibold">
            Comparison: {a.name} vs {b.name}
          </h3>
          <table className="mt-3 min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--muted)]">
                <th className="py-2">Metric</th>
                <th>{a.name}</th>
                <th>{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Sales", a.salesAmount, b.salesAmount],
                  ["Achievement %", a.achievementPct.toFixed(1), b.achievementPct.toFixed(1)],
                  ["GPS visits", a.gpsVerifiedVisits, b.gpsVerifiedVisits],
                  ["Samples", a.samplesGiven, b.samplesGiven],
                  ["Converted parties", a.convertedParties, b.convertedParties],
                  ["Incentive", a.incentive, b.incentive],
                ] as const
              ).map(([label, av, bv]) => (
                <tr key={label} className="border-t border-[var(--border)]">
                  <td className="py-2">{label}</td>
                  <td>{typeof av === "number" ? av.toLocaleString("en-IN") : av}</td>
                  <td>{typeof bv === "number" ? bv.toLocaleString("en-IN") : bv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-[1200px] w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2">Salesman</th>
              <th className="px-2 py-2">Products</th>
              <th className="px-2 py-2">Parties</th>
              <th className="px-2 py-2">Planned</th>
              <th className="px-2 py-2">Actual</th>
              <th className="px-2 py-2">GPS</th>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Samples</th>
              <th className="px-2 py-2">Sales</th>
              <th className="px-2 py-2">Target</th>
              <th className="px-2 py-2">Ach %</th>
              <th className="px-2 py-2">Incentive</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-2 py-2">
                  <Link href={`/salesmen/${r.id}`} className="text-[var(--accent)] hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-2 py-2">{r.products.join(", ") || "—"}</td>
                <td className="px-2 py-2">{r.assignedParties}</td>
                <td className="px-2 py-2">{r.plannedVisits}</td>
                <td className="px-2 py-2">{r.actualVisits}</td>
                <td className="px-2 py-2">{r.gpsVerifiedVisits}</td>
                <td className="px-2 py-2">
                  {Math.round(r.totalVisitSeconds / 60)}m
                </td>
                <td className="px-2 py-2">
                  {r.samplesGiven}/{r.samplesConverted}
                </td>
                <td className="px-2 py-2">
                  ₹{r.salesAmount.toLocaleString("en-IN")}
                </td>
                <td className="px-2 py-2">₹{r.target.toLocaleString("en-IN")}</td>
                <td className="px-2 py-2">{r.achievementPct.toFixed(1)}%</td>
                <td className="px-2 py-2">
                  ₹{r.incentive.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; name: string; achievementPct: number; salesAmount: number }>;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">{title}</h3>
      <ol className="mt-3 space-y-2 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex justify-between gap-3">
            <span>
              {i + 1}. {r.name}
            </span>
            <span>
              {r.achievementPct.toFixed(1)}% · ₹
              {r.salesAmount.toLocaleString("en-IN")}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
