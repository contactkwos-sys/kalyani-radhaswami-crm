import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartsPanel } from "@/components/intelligence/ChartsPanel";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getChartSeries } from "@/lib/intelligence/charts";
import { getReportContext } from "@/lib/intelligence/context";

const REPORTS = [
  { href: "/reports/sales", label: "Daily / Monthly Sales Report" },
  { href: "/reports/salesmen", label: "Salesman Performance Report" },
  { href: "/reports/products", label: "Product Performance Report" },
  { href: "/reports/party-development", label: "Party Development Report" },
  { href: "/reports/visits", label: "Party / GPS Visit Report" },
  { href: "/reports/followups", label: "Follow-up Report" },
  { href: "/reports/samples", label: "Sample & Conversion Report" },
  { href: "/reports/targets", label: "Target Report" },
  { href: "/incentives", label: "Incentive Report" },
  { href: "/reports/inactive", label: "Inactive / High Visit No Sales" },
  { href: "/reports/ranking", label: "Salesman Ranking Report" },
  { href: "/reports/matrix", label: "Product–Party Development Matrix" },
  { href: "/reports/daily-review", label: "Salesman Daily Review" },
  { href: "/reports/analysis", label: "Salesman vs Party Analysis" },
  { href: "/alerts", label: "Owner Alerts" },
];

export default async function ReportsHubPage({
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
    !["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER", "ACCOUNTANT", "VIEWER"].includes(
      ctx.profile.role
    )
  ) {
    redirect("/dashboard");
  }

  const charts = await getChartSeries(ctx.filters);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Management Reports
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Real database analytics · CSV export · print-friendly views
        </p>
      </div>

      <ReportFiltersBar
        companies={ctx.companies.filter((c) =>
          ctx.selectedCompanyIds.includes(c.id)
        )}
        products={ctx.products}
        salesmen={ctx.salesmen}
        parties={ctx.parties}
        defaults={{
          company:
            ctx.filters.companyIds.length === 1 ? ctx.filters.companyIds[0] : "",
          product: ctx.filters.productId || "",
          salesman: ctx.filters.salesmanId || "",
          party: ctx.filters.partyId || "",
          from: ctx.filters.from,
          to: ctx.filters.to,
          month: ctx.filters.month || "",
          fy: ctx.filters.financialYear || "",
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 font-medium hover:border-[var(--accent)]"
          >
            {r.label}
          </Link>
        ))}
      </div>

      <ChartsPanel data={charts} />
    </div>
  );
}
