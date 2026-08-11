import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getIntelligenceSettings } from "@/lib/intelligence/settings";
import { daysBetween, todayISO } from "@/lib/intelligence/filters";
import type {
  OwnerDashboardKpis,
  ReportFilters,
} from "@/types/intelligence";

function classifyParty(
  opts: {
    totalVisits: number;
    salesValue: number;
    potential: number;
    lastVisitAt: string | null;
    createdAt: string | null;
    status: string;
  },
  settings: Awaited<ReturnType<typeof getIntelligenceSettings>>,
  now: Date
): string {
  const daysSinceVisit = opts.lastVisitAt
    ? daysBetween(new Date(opts.lastVisitAt), now)
    : 9999;
  const ageDays = opts.createdAt
    ? daysBetween(new Date(opts.createdAt), now)
    : 9999;

  if (
    opts.salesValue >= settings.active_customer_min_sales &&
    daysSinceVisit <= settings.inactive_customer_days
  ) {
    return "ACTIVE_CUSTOMER";
  }
  if (
    opts.salesValue >= settings.active_customer_min_sales &&
    daysSinceVisit > settings.inactive_customer_days
  ) {
    return "INACTIVE_CUSTOMER";
  }
  if (
    opts.potential >= settings.high_potential_value &&
    opts.totalVisits < settings.high_potential_min_visits
  ) {
    return "HIGH_POTENTIAL";
  }
  if (opts.totalVisits === 0 && ageDays <= 30) return "NEW";
  if (opts.totalVisits === 0) return "NO_DEVELOPMENT";
  if (
    opts.totalVisits >= settings.hot_min_visits &&
    daysSinceVisit <= settings.hot_max_days_since_visit
  ) {
    return "HOT";
  }
  if (daysSinceVisit <= settings.warm_max_days_since_visit) return "WARM";
  if (daysSinceVisit <= settings.cold_max_days_since_visit) return "COLD";
  return "COLD";
}

export async function getOwnerDashboard(
  filters: ReportFilters
): Promise<OwnerDashboardKpis> {
  await requireProfile();
  const supabase = await createClient();
  const today = todayISO();
  const month = today.slice(0, 7);
  const yearStart =
    new Date().getMonth() + 1 >= 4
      ? `${new Date().getFullYear()}-04-01`
      : `${new Date().getFullYear() - 1}-04-01`;
  const settings = await getIntelligenceSettings(filters.companyIds[0] || null);
  const now = new Date();

  let salesQ = supabase
    .from("crm_sales")
    .select("id, sale_date, sales_value, salesman_id, product_id, party_id")
    .in("company_id", filters.companyIds);
  if (filters.productId) salesQ = salesQ.eq("product_id", filters.productId);
  if (filters.salesmanId) salesQ = salesQ.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) salesQ = salesQ.eq("party_id", filters.partyId);

  let visitsQ = supabase
    .from("crm_visits")
    .select(
      "id, visit_date, gps_verified, status, salesman_id, product_id, party_id, duration_seconds"
    )
    .in("company_id", filters.companyIds);
  if (filters.productId) visitsQ = visitsQ.eq("product_id", filters.productId);
  if (filters.salesmanId) visitsQ = visitsQ.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) visitsQ = visitsQ.eq("party_id", filters.partyId);

  const [
    { data: sales },
    { data: visits },
    { data: salesmen },
    { data: parties },
    { data: pp },
    { data: samples },
    { data: followups },
    { data: incentives },
    { data: targets },
  ] = await Promise.all([
    salesQ,
    visitsQ,
    supabase
      .from("crm_salesmen")
      .select("id, monthly_target, status")
      .in("company_id", filters.companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_parties")
      .select(
        "id, status, potential_monthly_business, created_at, current_business"
      )
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_party_products")
      .select("*")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_samples")
      .select("id, party_id, product_id, created_at")
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_followups")
      .select("id, is_completed, followup_date, party_id")
      .in("company_id", filters.companyIds)
      .eq("is_completed", false),
    supabase
      .from("crm_incentive_calculations")
      .select("calculated_amount, year_month, salesman_id")
      .in("company_id", filters.companyIds)
      .eq("year_month", month),
    supabase
      .from("crm_salesman_targets")
      .select("sales_target, salesman_id")
      .in("company_id", filters.companyIds)
      .eq("year_month", month)
      .is("product_id", null),
  ]);

  const inRange = (d: string) => d >= filters.from && d <= filters.to;
  const salesRows = sales || [];
  const visitRows = (visits || []).filter((v) => v.gps_verified);

  const salesToday = salesRows
    .filter((s) => s.sale_date === today)
    .reduce((a, s) => a + Number(s.sales_value), 0);
  const salesMonth = salesRows
    .filter((s) => s.sale_date.startsWith(month))
    .reduce((a, s) => a + Number(s.sales_value), 0);
  const salesYear = salesRows
    .filter((s) => s.sale_date >= yearStart)
    .reduce((a, s) => a + Number(s.sales_value), 0);

  const targetFromRows = (targets || []).reduce(
    (a, t) => a + Number(t.sales_target),
    0
  );
  const targetFromMasters = (salesmen || []).reduce(
    (a, s) => a + Number(s.monthly_target || 0),
    0
  );
  const target = targetFromRows > 0 ? targetFromRows : targetFromMasters;

  const converted = (pp || []).filter((p) =>
    ["CONVERTED", "REGULAR_SALE"].includes(p.development_status)
  );
  const notConverted = (pp || []).filter(
    (p) => !["CONVERTED", "REGULAR_SALE"].includes(p.development_status)
  );

  const samplePartyProducts = new Set(
    (pp || []).filter((p) => p.sample_given_at).map((p) => `${p.party_id}:${p.product_id}`)
  );
  const sampleConverted = (pp || []).filter(
    (p) =>
      p.sample_given_at &&
      ["CONVERTED", "REGULAR_SALE", "PRODUCT_STARTED"].includes(
        p.development_status
      ) &&
      Number(p.total_sales_value) > 0
  ).length;

  let partiesIgnored = 0;
  let highVisitLowSales = 0;
  let lowVisitHighPotential = 0;
  let newPartiesDeveloped = 0;

  for (const party of parties || []) {
    const partyPp = (pp || []).filter((p) => p.party_id === party.id);
    const visitsCount = partyPp.reduce((a, p) => a + Number(p.total_visits), 0);
    const salesValue = partyPp.reduce(
      (a, p) => a + Number(p.total_sales_value),
      0
    );
    const lastVisit = partyPp
      .map((p) => p.last_visit_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] as string | null;
    const cls = classifyParty(
      {
        totalVisits: visitsCount,
        salesValue,
        potential: Number(party.potential_monthly_business || 0),
        lastVisitAt: lastVisit,
        createdAt: party.created_at,
        status: party.status,
      },
      settings,
      now
    );
    if (cls === "NEW" || (party.created_at && party.created_at >= filters.from)) {
      if (visitsCount > 0 && inRange(party.created_at?.slice(0, 10) || "")) {
        newPartiesDeveloped += 1;
      } else if (visitsCount > 0 && !party.created_at) {
        newPartiesDeveloped += 1;
      }
    }
    if (!lastVisit || daysBetween(new Date(lastVisit), now) >= settings.inactive_days) {
      partiesIgnored += 1;
    }
    if (
      visitsCount >= settings.high_visits_no_sales &&
      salesValue === 0
    ) {
      highVisitLowSales += 1;
    }
    if (
      Number(party.potential_monthly_business) >= settings.high_potential_value &&
      visitsCount < settings.high_potential_min_visits
    ) {
      lowVisitHighPotential += 1;
    }
  }

  // Prefer created-in-range parties with first visit
  newPartiesDeveloped = (parties || []).filter((p) => {
    const created = p.created_at?.slice(0, 10);
    if (!created || created < filters.from || created > filters.to) return false;
    return (pp || []).some(
      (x) => x.party_id === p.id && Number(x.total_visits) > 0
    );
  }).length;

  return {
    salesToday,
    salesMonth,
    salesYear,
    target,
    achievementPct: target > 0 ? (salesMonth / target) * 100 : 0,
    incentiveGenerated: (incentives || []).reduce(
      (a, i) => a + Number(i.calculated_amount),
      0
    ),
    activeSalesmen: (salesmen || []).length,
    activeParties: (parties || []).filter((p) =>
      ["PROSPECT", "SAMPLE", "TRIAL", "CONVERTED", "REGULAR", "NEW"].includes(
        p.status
      )
    ).length,
    visitsToday: visitRows.filter((v) => v.visit_date === today).length,
    visitsMonth: visitRows.filter((v) => v.visit_date.startsWith(month)).length,
    newPartiesDeveloped,
    partiesConverted: converted.length,
    partiesNotConverted: notConverted.length,
    samplesGiven: Math.max((samples || []).length, samplePartyProducts.size),
    samplesConverted: sampleConverted,
    followupsPending: (followups || []).length,
    partiesIgnored,
    highVisitLowSales,
    lowVisitHighPotential,
  };
}
