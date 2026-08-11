import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";
import { getLicensesForCompanies, formatTrialRemaining } from "@/lib/license/trial";
import { getSalesmanSalesSummary, listSales } from "@/lib/sales/actions";
import { getOwnerInterventionList, getPerformanceReports } from "@/lib/sales/analytics";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const companies = await getAccessibleCompanies(profile.id, profile.role);
  const companyIds =
    profile.company_scope === "ALL" || !profile.preferred_company_id
      ? companies.map((c) => c.id)
      : [profile.preferred_company_id];
  const licenses = await getLicensesForCompanies(companies.map((c) => c.id));
  const perms = ROLE_PERMISSIONS[profile.role];
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  if (profile.role === "SALESMAN") {
    return <SalesmanDashboard profileName={profile.full_name} userId={profile.id} month={month} />;
  }

  if (profile.role === "ACCOUNTANT") {
    return (
      <AccountantDashboard
        profileName={profile.full_name}
        companyIds={companyIds}
        today={today}
        month={month}
      />
    );
  }

  const reports = await getPerformanceReports(companyIds);
  const alerts = await getOwnerInterventionList(companyIds);
  const red = alerts.filter((a) => a.severity === "RED").length;
  const amber = alerts.filter((a) => a.severity === "AMBER").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
          Welcome, {profile.full_name}
        </h2>
        <p className="mt-1 text-[var(--muted)]">
          Owner/Admin dashboard · {perms.label} · {month}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Sales"
          value={`₹${reports.totals.salesValue.toLocaleString("en-IN")}`}
          href="/sales"
        />
        <Kpi
          label="Target achievement"
          value={`${avgAchievement(reports.salesmanPerf).toFixed(1)}%`}
          href="/settings/targets"
        />
        <Kpi
          label="Incentive"
          value={`₹${reports.totals.incentives.toLocaleString("en-IN")}`}
          href="/incentives"
        />
        <Kpi label="Visits" value={String(reports.totals.visits)} href="/today" />
        <Kpi
          label="Conversion alerts"
          value={`${amber} amber`}
          href="/reports"
        />
        <Kpi label="Alerts (RED)" value={String(red)} href="/intervention" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <QuickLink href="/sales/new" label="Accountant sales entry" />
        <QuickLink href="/intervention" label="Owner intervention" />
        <QuickLink href="/reports" label="Performance reports" />
        <QuickLink href="/settings/incentives" label="Incentive settings" />
      </div>

      <LicenseCard companies={companies} licenses={licenses} />
    </div>
  );
}

async function SalesmanDashboard({
  profileName,
  userId,
  month,
}: {
  profileName: string;
  userId: string;
  month: string;
}) {
  const supabase = await createClient();
  const { data: salesman } = await supabase
    .from("crm_salesmen")
    .select("id, name, monthly_target")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!salesman) {
    return (
      <div className="space-y-4">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Welcome, {profileName}
        </h2>
        <p className="text-[var(--muted)]">
          No salesman master linked to your login. Ask Owner/Admin to link your user.
        </p>
      </div>
    );
  }

  const summary = await getSalesmanSalesSummary(salesman.id, month);
  const { data: followups } = await supabase
    .from("crm_followups")
    .select("id, followup_date, party:crm_parties(party_name)")
    .eq("salesman_id", salesman.id)
    .eq("is_completed", false)
    .order("followup_date")
    .limit(5);

  const { data: todayPlan } = await supabase
    .from("crm_daily_plans")
    .select("id, plan_date, planned_parties_count, items:crm_planned_visits(id)")
    .eq("salesman_id", salesman.id)
    .eq("plan_date", summary.today)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {salesman.name}
        </h2>
        <p className="mt-1 text-[var(--muted)]">
          Today&apos;s plan · visits · sales · target · incentive
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Kpi label="Today's sales" value={`₹${summary.todayValue.toLocaleString("en-IN")}`} href="/sales" />
        <Kpi label="Parties sold today" value={String(summary.todayParties)} href="/sales" />
        <Kpi label="MTD sales" value={`₹${summary.monthValue.toLocaleString("en-IN")}`} href="/sales" />
        <Kpi label="Monthly target" value={`₹${summary.target.toLocaleString("en-IN")}`} href="/sales" />
        <Kpi
          label="Achievement"
          value={`${summary.achievement.toFixed(1)}%`}
          href="/incentives"
        />
        <Kpi
          label="Est. / Conf. incentive"
          value={`₹${summary.estimatedIncentive.toLocaleString("en-IN")} / ₹${summary.confirmedIncentive.toLocaleString("en-IN")}`}
          href="/incentives"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <QuickLink
          href="/today"
          label={`Today's plan (${Array.isArray(todayPlan?.items) ? todayPlan?.items.length : 0})`}
        />
        <QuickLink href="/today" label="Today's visits" />
        <QuickLink href="/follow-ups" label="Follow-ups" />
        <QuickLink href="/parties" label="Party development" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown
          title="Product-wise sales (MTD)"
          entries={Object.entries(summary.byProduct)}
        />
        <Breakdown
          title="Party-wise sales (MTD)"
          entries={Object.entries(summary.byParty)}
        />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Upcoming follow-ups</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(followups || []).map((f) => {
            const party = Array.isArray(f.party) ? f.party[0] : f.party;
            return (
              <li key={f.id}>
                {f.followup_date} · {party?.party_name || "Party"}
              </li>
            );
          })}
          {(followups || []).length === 0 && (
            <li className="text-[var(--muted)]">No open follow-ups.</li>
          )}
        </ul>
      </section>

      <p className="text-sm text-[var(--muted)]">
        Remaining target: ₹{summary.remaining.toLocaleString("en-IN")}. Accountant
        sales are read-only.
      </p>
    </div>
  );
}

async function AccountantDashboard({
  profileName,
  companyIds,
  today,
  month,
}: {
  profileName: string;
  companyIds: string[];
  today: string;
  month: string;
}) {
  const sales = await listSales({ companyIds, from: `${month}-01` });
  const todaySales = sales.filter((s) => s.sale_date === today);
  const todayValue = todaySales.reduce((a, s) => a + Number(s.sales_value), 0);
  const monthValue = sales.reduce((a, s) => a + Number(s.sales_value), 0);

  const byParty = new Map<string, number>();
  const byProduct = new Map<string, number>();
  const bySalesman = new Map<string, number>();
  for (const s of sales) {
    const party = s.party?.party_name || s.party_id;
    const product = s.product?.product_name || s.product_id;
    const salesman = s.salesman?.name || s.salesman_id;
    byParty.set(party, (byParty.get(party) || 0) + Number(s.sales_value));
    byProduct.set(product, (byProduct.get(product) || 0) + Number(s.sales_value));
    bySalesman.set(salesman, (bySalesman.get(salesman) || 0) + Number(s.sales_value));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Welcome, {profileName}
        </h2>
        <p className="mt-1 text-[var(--muted)]">Accountant dashboard · daily sales entry</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Today's entries" value={String(todaySales.length)} href="/sales" />
        <Kpi
          label="Today's sales value"
          value={`₹${todayValue.toLocaleString("en-IN")}`}
          href="/sales"
        />
        <Kpi
          label="MTD sales"
          value={`₹${monthValue.toLocaleString("en-IN")}`}
          href="/reports"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <QuickLink href="/sales/new" label="Daily sales entry" />
        <QuickLink href="/sales" label="Sales summary" />
        <QuickLink href="/reports" label="Party / product / salesman sales" />
        <QuickLink href="/parties" label="Parties" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Party sales" entries={[...byParty.entries()].slice(0, 8)} />
        <Breakdown title="Product sales" entries={[...byProduct.entries()].slice(0, 8)} />
        <Breakdown title="Salesman sales" entries={[...bySalesman.entries()].slice(0, 8)} />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)]"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-medium hover:border-[var(--accent)]"
    >
      {label}
    </Link>
  );
}

function Breakdown({
  title,
  entries,
}: {
  title: string;
  entries: [string, number][];
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {entries
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="truncate">{k}</span>
              <span className="font-medium">₹{Number(v).toLocaleString("en-IN")}</span>
            </li>
          ))}
        {entries.length === 0 && (
          <li className="text-[var(--muted)]">No data yet.</li>
        )}
      </ul>
    </section>
  );
}

function avgAchievement(
  rows: Array<{ achievement: number }>
): number {
  if (!rows.length) return 0;
  return rows.reduce((a, r) => a + r.achievement, 0) / rows.length;
}

function LicenseCard({
  companies,
  licenses,
}: {
  companies: Array<{ id: string; name: string }>;
  licenses: Array<{
    company_id: string;
    status: string;
    trial_remaining_seconds: number;
  }>;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-semibold">License / trial</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {licenses.map((l) => {
          const company = companies.find((c) => c.id === l.company_id);
          return (
            <li key={l.company_id}>
              <span className="font-medium">{company?.name}</span>
              <span className="text-[var(--muted)]">
                {" "}
                · {l.status}
                {l.status.startsWith("TRIAL") &&
                  ` · ${formatTrialRemaining(l.trial_remaining_seconds)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
