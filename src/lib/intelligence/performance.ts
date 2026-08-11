"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type {
  ProductPerformanceRow,
  ReportFilters,
  SalesmanPerformanceRow,
} from "@/types/intelligence";

export async function getSalesmanPerformance(
  filters: ReportFilters
): Promise<SalesmanPerformanceRow[]> {
  await requireProfile();
  const supabase = await createClient();
  const month = filters.to.slice(0, 7);

  const [
    { data: salesmen },
    { data: sp },
    { data: ps },
    { data: plans },
    { data: visits },
    { data: followups },
    { data: samples },
    { data: sales },
    { data: incentives },
    { data: targets },
    { data: pp },
    { data: parties },
  ] = await Promise.all([
    supabase
      .from("crm_salesmen")
      .select("id, name, company_id, monthly_target, status")
      .in("company_id", filters.companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_salesman_products")
      .select("salesman_id, product:crm_products(product_name)")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_party_salesmen")
      .select("salesman_id, party_id")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_planned_visits")
      .select("id, daily_plan_id, company_id, daily_plan:crm_daily_plans(salesman_id, plan_date)")
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_visits")
      .select(
        "id, salesman_id, party_id, visit_date, gps_verified, status, duration_seconds"
      )
      .in("company_id", filters.companyIds)
      .gte("visit_date", filters.from)
      .lte("visit_date", filters.to),
    supabase
      .from("crm_followups")
      .select("id, salesman_id, followup_date, is_completed")
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_samples")
      .select("id, salesman_id, party_id, product_id")
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_sales")
      .select("salesman_id, sales_value, party_id, product_id, sale_date")
      .in("company_id", filters.companyIds)
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to),
    supabase
      .from("crm_incentive_calculations")
      .select("salesman_id, calculated_amount, year_month")
      .in("company_id", filters.companyIds)
      .eq("year_month", month),
    supabase
      .from("crm_salesman_targets")
      .select("salesman_id, sales_target, year_month")
      .in("company_id", filters.companyIds)
      .eq("year_month", month)
      .is("product_id", null),
    supabase
      .from("crm_party_products")
      .select("party_id, product_id, development_status, total_sales_value")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_parties")
      .select("id, created_at")
      .in("company_id", filters.companyIds),
  ]);

  let list = salesmen || [];
  if (filters.salesmanId) list = list.filter((s) => s.id === filters.salesmanId);

  return list.map((s) => {
    const products = (sp || [])
      .filter((x) => x.salesman_id === s.id)
      .map((x) => {
        const p = Array.isArray(x.product) ? x.product[0] : x.product;
        return p?.product_name || "";
      })
      .filter(Boolean);
    const assignedPartyIds = [
      ...new Set(
        (ps || []).filter((x) => x.salesman_id === s.id).map((x) => x.party_id)
      ),
    ];
    const sVisits = (visits || []).filter((v) => v.salesman_id === s.id);
    const gps = sVisits.filter((v) => v.gps_verified);
    const totalSecs = gps.reduce((a, v) => a + Number(v.duration_seconds || 0), 0);
    const partiesVisited = new Set(gps.map((v) => v.party_id)).size;
    const planned = (plans || []).filter((pv) => {
      const dp = Array.isArray(pv.daily_plan) ? pv.daily_plan[0] : pv.daily_plan;
      return (
        dp?.salesman_id === s.id &&
        dp.plan_date >= filters.from &&
        dp.plan_date <= filters.to
      );
    }).length;
    const sSales = (sales || []).filter((x) => x.salesman_id === s.id);
    const salesAmount = sSales.reduce((a, x) => a + Number(x.sales_value), 0);
    const targetRow = (targets || []).find((t) => t.salesman_id === s.id);
    const target = Number(targetRow?.sales_target ?? s.monthly_target ?? 0);
    const sampleIds = (samples || []).filter((x) => x.salesman_id === s.id);
    const samplesConverted = sampleIds.filter((sm) =>
      (pp || []).some(
        (p) =>
          p.party_id === sm.party_id &&
          p.product_id === sm.product_id &&
          Number(p.total_sales_value) > 0
      )
    ).length;
    const convertedParties = assignedPartyIds.filter((pid) =>
      (pp || []).some(
        (p) =>
          p.party_id === pid &&
          ["CONVERTED", "REGULAR_SALE"].includes(p.development_status)
      )
    ).length;
    const newParties = assignedPartyIds.filter((pid) => {
      const party = (parties || []).find((p) => p.id === pid);
      const created = party?.created_at?.slice(0, 10);
      return created && created >= filters.from && created <= filters.to;
    }).length;
    const lastVisit = gps
      .map((v) => v.visit_date)
      .sort()
      .reverse()[0] || null;
    const nextFu = (followups || [])
      .filter((f) => f.salesman_id === s.id && !f.is_completed)
      .map((f) => f.followup_date)
      .sort()[0] || null;

    return {
      id: s.id,
      name: s.name,
      company_id: s.company_id,
      products,
      assignedParties: assignedPartyIds.length,
      plannedVisits: planned,
      actualVisits: sVisits.length,
      gpsVerifiedVisits: gps.length,
      totalVisitSeconds: totalSecs,
      avgTimePerParty: partiesVisited > 0 ? totalSecs / partiesVisited : 0,
      followups: (followups || []).filter((f) => f.salesman_id === s.id).length,
      samplesGiven: sampleIds.length,
      samplesConverted,
      salesAmount,
      target,
      achievementPct: target > 0 ? (salesAmount / target) * 100 : 0,
      incentive: (incentives || [])
        .filter((i) => i.salesman_id === s.id)
        .reduce((a, i) => a + Number(i.calculated_amount), 0),
      newParties,
      convertedParties,
      nonConvertedParties: Math.max(0, assignedPartyIds.length - convertedParties),
      lastVisitDate: lastVisit,
      nextFollowupDate: nextFu,
    };
  });
}

export async function getProductPerformance(
  filters: ReportFilters
): Promise<ProductPerformanceRow[]> {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: products },
    { data: sp },
    { data: pp },
    { data: visits },
    { data: sales },
    { data: samples },
    { data: followups },
  ] = await Promise.all([
    supabase
      .from("crm_products")
      .select("id, product_name, product_code, company_id, monthly_target, status")
      .in("company_id", filters.companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_salesman_products")
      .select("product_id, salesman_id")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_party_products")
      .select("*")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_visits")
      .select("product_id, gps_verified, visit_date")
      .in("company_id", filters.companyIds)
      .gte("visit_date", filters.from)
      .lte("visit_date", filters.to),
    supabase
      .from("crm_sales")
      .select("product_id, sales_value, sale_date")
      .in("company_id", filters.companyIds)
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to),
    supabase
      .from("crm_samples")
      .select("product_id, party_id")
      .in("company_id", filters.companyIds),
    supabase
      .from("crm_followups")
      .select("id, party_id")
      .in("company_id", filters.companyIds),
  ]);

  let list = products || [];
  if (filters.productId) list = list.filter((p) => p.id === filters.productId);

  // Prior period for trend: same length before from
  const fromDate = new Date(filters.from);
  const toDate = new Date(filters.to);
  const span = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(fromDate.getTime() - span - 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: prevSales } = await supabase
    .from("crm_sales")
    .select("product_id, sales_value, sale_date")
    .in("company_id", filters.companyIds)
    .gte("sale_date", prevFrom)
    .lte("sale_date", prevTo);

  return list.map((p) => {
    const pPp = (pp || []).filter((x) => x.product_id === p.id);
    const totalSales = (sales || [])
      .filter((s) => s.product_id === p.id)
      .reduce((a, s) => a + Number(s.sales_value), 0);
    const prev = (prevSales || [])
      .filter((s) => s.product_id === p.id)
      .reduce((a, s) => a + Number(s.sales_value), 0);
    const target = Number(p.monthly_target || 0);
    const samplesGiven = Math.max(
      (samples || []).filter((s) => s.product_id === p.id).length,
      pPp.filter((x) => x.sample_given_at).length
    );
    const samplesConverted = pPp.filter(
      (x) => x.sample_given_at && Number(x.total_sales_value) > 0
    ).length;
    const converted = pPp.filter((x) =>
      ["CONVERTED", "REGULAR_SALE"].includes(x.development_status)
    ).length;
    let trend: ProductPerformanceRow["trend"] = "STABLE";
    if (totalSales > prev * 1.1) trend = "GROWING";
    else if (totalSales < prev * 0.8 || (pPp.length > 10 && converted < 2))
      trend = "NEEDS_ATTENTION";

    return {
      id: p.id,
      product_name: p.product_name,
      product_code: p.product_code,
      company_id: p.company_id,
      assignedSalesmen: new Set(
        (sp || []).filter((x) => x.product_id === p.id).map((x) => x.salesman_id)
      ).size,
      totalParties: pPp.length,
      totalVisits: (visits || []).filter(
        (v) => v.product_id === p.id && v.gps_verified
      ).length,
      totalSales,
      target,
      achievementPct: target > 0 ? (totalSales / target) * 100 : 0,
      samplesGiven,
      samplesConverted,
      conversionPct: pPp.length > 0 ? (converted / pPp.length) * 100 : 0,
      followups: (followups || []).filter((f) =>
        pPp.some((x) => x.party_id === f.party_id)
      ).length,
      nonConvertedParties: pPp.length - converted,
      trend,
    };
  });
}

export async function getSalesmanPartyProductAnalysis(input: {
  salesmanId: string;
  partyId: string;
  productId: string;
}) {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: visits },
    { data: followups },
    { data: samples },
    { data: sales },
    { data: pp },
  ] = await Promise.all([
    supabase
      .from("crm_visits")
      .select("*, feedback:crm_visit_feedback(*)")
      .eq("salesman_id", input.salesmanId)
      .eq("party_id", input.partyId)
      .eq("product_id", input.productId)
      .order("start_at", { ascending: true }),
    supabase
      .from("crm_followups")
      .select("*")
      .eq("salesman_id", input.salesmanId)
      .eq("party_id", input.partyId),
    supabase
      .from("crm_samples")
      .select("*")
      .eq("salesman_id", input.salesmanId)
      .eq("party_id", input.partyId)
      .eq("product_id", input.productId),
    supabase
      .from("crm_sales")
      .select("*")
      .eq("salesman_id", input.salesmanId)
      .eq("party_id", input.partyId)
      .eq("product_id", input.productId),
    supabase
      .from("crm_party_products")
      .select("*")
      .eq("party_id", input.partyId)
      .eq("product_id", input.productId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const gps = (visits || []).filter((v) => v.gps_verified);
  const totalSecs = gps.reduce((a, v) => a + Number(v.duration_seconds || 0), 0);
  const samplesGiven = (samples || []).length || (pp?.sample_given_at ? 1 : 0);
  const salesValue = (sales || []).reduce((a, s) => a + Number(s.sales_value), 0);
  const visitCount = gps.length;
  const orderCount = (sales || []).length;

  return {
    visits: visits || [],
    followups: followups || [],
    samples: samples || [],
    sales: sales || [],
    status: pp,
    metrics: {
      visitCount,
      totalVisitSeconds: totalSecs,
      avgDuration: visitCount > 0 ? totalSecs / visitCount : 0,
      followups: (followups || []).length,
      samplesGiven,
      salesValue,
      lastVisit: gps.map((v) => v.visit_date).sort().reverse()[0] || null,
      nextFollowup:
        (followups || [])
          .filter((f) => !f.is_completed)
          .map((f) => f.followup_date)
          .sort()[0] || null,
      conversion: pp?.development_status || "NOT_STARTED",
      visitToSample: visitCount > 0 ? (samplesGiven / visitCount) * 100 : 0,
      sampleToOrder: samplesGiven > 0 ? (orderCount > 0 ? 100 : 0) : 0,
      visitToOrder: visitCount > 0 ? (orderCount / visitCount) * 100 : 0,
    },
  };
}
