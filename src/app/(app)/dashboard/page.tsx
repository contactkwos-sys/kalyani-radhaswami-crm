import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartsPanel } from "@/components/intelligence/ChartsPanel";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { GlobalSearch } from "@/components/intelligence/GlobalSearch";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getOwnerDashboard } from "@/lib/intelligence/dashboard";
import { getChartSeries } from "@/lib/intelligence/charts";
import { getManagementAlerts } from "@/lib/intelligence/alerts";
import { getReportContext } from "@/lib/intelligence/context";
import { BackupHealthCard } from "@/components/backup/BackupHealthCard";
import { getBackupHealth } from "@/lib/backup/actions";
import { getSalesmanSalesSummary, listSales } from "@/lib/sales/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage({
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

  if (ctx.profile.role === "SALESMAN") {
    return <SalesmanDashboard userId={ctx.profile.id} name={ctx.profile.full_name} />;
  }
  if (ctx.profile.role === "ACCOUNTANT") {
    return (
      <AccountantDashboard
        name={ctx.profile.full_name}
        companyIds={ctx.selectedCompanyIds}
      />
    );
  }

  const [kpis, charts, alerts, backupHealth] = await Promise.all([
    getOwnerDashboard(ctx.filters),
    getChartSeries(ctx.filters),
    getManagementAlerts(ctx.filters.companyIds),
    ctx.profile.role === "OWNER" || ctx.profile.role === "ADMIN"
      ? getBackupHealth().catch(() => null)
      : Promise.resolve(null),
  ]);

  const kpiRows = [
    { label: "Sales today", value: `₹${kpis.salesToday.toLocaleString("en-IN")}` },
    { label: "Sales this month", value: `₹${kpis.salesMonth.toLocaleString("en-IN")}` },
    { label: "Sales this year", value: `₹${kpis.salesYear.toLocaleString("en-IN")}` },
    { label: "Target", value: `₹${kpis.target.toLocaleString("en-IN")}` },
    { label: "Achievement %", value: `${kpis.achievementPct.toFixed(1)}%` },
    {
      label: "Incentive generated",
      value: `₹${kpis.incentiveGenerated.toLocaleString("en-IN")}`,
    },
    { label: "Active salesmen", value: String(kpis.activeSalesmen) },
    { label: "Active parties", value: String(kpis.activeParties) },
    { label: "Visits today", value: String(kpis.visitsToday) },
    { label: "Visits this month", value: String(kpis.visitsMonth) },
    { label: "New parties developed", value: String(kpis.newPartiesDeveloped) },
    { label: "Parties converted", value: String(kpis.partiesConverted) },
    { label: "Parties not converted", value: String(kpis.partiesNotConverted) },
    { label: "Samples given", value: String(kpis.samplesGiven) },
    { label: "Samples converted", value: String(kpis.samplesConverted) },
    { label: "Follow-ups pending", value: String(kpis.followupsPending) },
    { label: "Parties being ignored", value: String(kpis.partiesIgnored) },
    { label: "High visit / low sales", value: String(kpis.highVisitLowSales) },
    {
      label: "Low visit / high potential",
      value: String(kpis.lowVisitHighPotential),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Owner Master Dashboard
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Management intelligence · {ctx.filters.from} → {ctx.filters.to}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GlobalSearch />
          <PrintButton />
          <ExportCsvButton
            filename="owner-dashboard-kpis.csv"
            rows={kpiRows.map((k) => ({ metric: k.label, value: k.value }))}
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
        defaults={{
          company: ctx.filters.companyIds.length === 1 ? ctx.filters.companyIds[0] : "",
          product: ctx.filters.productId || "",
          salesman: ctx.filters.salesmanId || "",
          party: ctx.filters.partyId || "",
          from: ctx.filters.from,
          to: ctx.filters.to,
          month: ctx.filters.month || "",
          fy: ctx.filters.financialYear || "",
        }}
      />

      {backupHealth && <BackupHealthCard health={backupHealth} />}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {kpiRows.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {k.label}
            </p>
            <p className="mt-1 text-lg font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <Quick href="/alerts" label="Owner alerts" />
        <Quick href="/reports/salesmen" label="Salesman performance" />
        <Quick href="/reports/products" label="Product performance" />
        <Quick href="/reports/matrix" label="Product–party matrix" />
        <Quick href="/reports/daily-review" label="Daily review" />
        <Quick href="/reports/analysis" label="Salesman vs party" />
        <Quick href="/intervention" label="Intervention list" />
        <Quick href="/incentives" label="Incentive report" />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Priority alerts</h3>
          <Link href="/alerts" className="text-sm text-[var(--accent)] hover:underline">
            View all
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {alerts.slice(0, 6).map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="hover:underline">
                <span
                  className={
                    a.severity === "RED"
                      ? "font-bold text-red-700"
                      : a.severity === "YELLOW"
                        ? "font-bold text-amber-700"
                        : "font-bold text-emerald-700"
                  }
                >
                  {a.severity}
                </span>{" "}
                {a.title}
              </Link>
            </li>
          ))}
          {alerts.length === 0 && (
            <li className="text-[var(--muted)]">No alerts for current scope.</li>
          )}
        </ul>
      </section>

      <ChartsPanel data={charts} />
    </div>
  );
}

function Quick({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-medium hover:border-[var(--accent)]"
    >
      {label}
    </Link>
  );
}

async function SalesmanDashboard({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const supabase = await createClient();
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);
  const { data: salesman } = await supabase
    .from("crm_salesmen")
    .select("id, name")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (!salesman) {
    return (
      <div>
        <h2 className="text-2xl font-semibold">Welcome, {name}</h2>
        <p className="text-[var(--muted)]">No salesman master linked.</p>
      </div>
    );
  }
  const summary = await getSalesmanSalesSummary(salesman.id, month);
  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        {salesman.name}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Today's sales" value={`₹${summary.todayValue.toLocaleString("en-IN")}`} />
        <Kpi label="Parties sold today" value={String(summary.todayParties)} />
        <Kpi label="MTD sales" value={`₹${summary.monthValue.toLocaleString("en-IN")}`} />
        <Kpi label="Target" value={`₹${summary.target.toLocaleString("en-IN")}`} />
        <Kpi label="Achievement" value={`${summary.achievement.toFixed(1)}%`} />
        <Kpi
          label="Est. incentive"
          value={`₹${summary.estimatedIncentive.toLocaleString("en-IN")}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <Quick href="/today" label="Today's plan & visits" />
        <Quick href="/sales" label="My sales (read-only)" />
        <Quick href="/follow-ups" label="Follow-ups" />
        <Quick href="/incentives" label="My incentives" />
      </div>
    </div>
  );
}

async function AccountantDashboard({
  name,
  companyIds,
}: {
  name: string;
  companyIds: string[];
}) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const month = today.slice(0, 7);
  const sales = await listSales({ companyIds, from: `${month}-01` });
  const todaySales = sales.filter((s) => s.sale_date === today);
  const todayValue = todaySales.reduce((a, s) => a + Number(s.sales_value), 0);
  return (
    <div className="space-y-6">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
        Welcome, {name}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Today's entries" value={String(todaySales.length)} />
        <Kpi label="Today's value" value={`₹${todayValue.toLocaleString("en-IN")}`} />
        <Kpi
          label="MTD sales"
          value={`₹${sales.reduce((a, s) => a + Number(s.sales_value), 0).toLocaleString("en-IN")}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <Quick href="/sales/new" label="Daily sales entry" />
        <Quick href="/reports/sales" label="Sales reports" />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
