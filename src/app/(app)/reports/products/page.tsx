import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getReportContext } from "@/lib/intelligence/context";
import { getProductPerformance } from "@/lib/intelligence/performance";

export default async function ProductPerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await getReportContext(await searchParams);
  } catch {
    redirect("/login");
  }
  if (
    !["OWNER", "ADMIN", "SALES_MANAGER", "ACCOUNTANT"].includes(ctx.profile.role)
  ) {
    redirect("/dashboard");
  }

  const rows = await getProductPerformance(ctx.filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Product Performance
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="product-performance.csv"
            rows={rows.map((r) => ({
              product: r.product_name,
              code: r.product_code,
              salesmen: r.assignedSalesmen,
              parties: r.totalParties,
              visits: r.totalVisits,
              sales: r.totalSales,
              target: r.target,
              achievement: r.achievementPct,
              samples: r.samplesGiven,
              samples_converted: r.samplesConverted,
              conversion_pct: r.conversionPct,
              followups: r.followups,
              non_converted: r.nonConvertedParties,
              trend: r.trend,
            }))}
          />
        </div>
      </div>

      <ReportFiltersBar
        companies={ctx.companies.filter((c) =>
          ctx.selectedCompanyIds.includes(c.id)
        )}
        products={ctx.products}
        salesmen={ctx.salesmen}
        parties={ctx.parties}
        defaults={{ from: ctx.filters.from, to: ctx.filters.to }}
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Salesmen</th>
              <th className="px-3 py-2">Parties</th>
              <th className="px-3 py-2">Visits</th>
              <th className="px-3 py-2">Sales</th>
              <th className="px-3 py-2">Ach %</th>
              <th className="px-3 py-2">Samples</th>
              <th className="px-3 py-2">Conv %</th>
              <th className="px-3 py-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/products/${r.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {r.product_name}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.assignedSalesmen}</td>
                <td className="px-3 py-2">{r.totalParties}</td>
                <td className="px-3 py-2">{r.totalVisits}</td>
                <td className="px-3 py-2">
                  ₹{r.totalSales.toLocaleString("en-IN")}
                </td>
                <td className="px-3 py-2">{r.achievementPct.toFixed(1)}%</td>
                <td className="px-3 py-2">
                  {r.samplesGiven}/{r.samplesConverted}
                </td>
                <td className="px-3 py-2">{r.conversionPct.toFixed(1)}%</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.trend === "GROWING"
                        ? "text-emerald-700"
                        : r.trend === "NEEDS_ATTENTION"
                          ? "text-red-700"
                          : "text-[var(--muted)]"
                    }
                  >
                    {r.trend}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
