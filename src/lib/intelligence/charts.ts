"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { ReportFilters } from "@/types/intelligence";

export async function getChartSeries(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: sales },
    { data: visits },
    { data: salesmen },
    { data: products },
    { data: pp },
    { data: samples },
  ] = await Promise.all([
    supabase
      .from("crm_sales")
      .select("sale_date, sales_value, salesman_id, product_id")
      .in("company_id", filters.companyIds)
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to),
    supabase
      .from("crm_visits")
      .select("visit_date, gps_verified, salesman_id")
      .in("company_id", filters.companyIds)
      .gte("visit_date", filters.from)
      .lte("visit_date", filters.to),
    supabase
      .from("crm_salesmen")
      .select("id, name, monthly_target")
      .in("company_id", filters.companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_products")
      .select("id, product_name")
      .in("company_id", filters.companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_party_products")
      .select("development_status, sample_given_at, total_sales_value")
      .in("company_id", filters.companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_samples")
      .select("id")
      .in("company_id", filters.companyIds),
  ]);

  const byMonth = new Map<string, number>();
  for (const s of sales || []) {
    const m = s.sale_date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + Number(s.sales_value));
  }

  const bySalesman = (salesmen || []).map((sm) => {
    const value = (sales || [])
      .filter((s) => s.salesman_id === sm.id)
      .reduce((a, s) => a + Number(s.sales_value), 0);
    return {
      name: sm.name,
      sales: value,
      target: Number(sm.monthly_target || 0),
    };
  });

  const byProduct = (products || []).map((p) => ({
    name: p.product_name,
    sales: (sales || [])
      .filter((s) => s.product_id === p.id)
      .reduce((a, s) => a + Number(s.sales_value), 0),
  }));

  const visitsByMonth = new Map<string, number>();
  const salesByMonthCount = new Map<string, number>();
  for (const v of visits || []) {
    if (!v.gps_verified) continue;
    const m = v.visit_date.slice(0, 7);
    visitsByMonth.set(m, (visitsByMonth.get(m) || 0) + 1);
  }
  for (const s of sales || []) {
    const m = s.sale_date.slice(0, 7);
    salesByMonthCount.set(m, (salesByMonthCount.get(m) || 0) + 1);
  }
  const months = [
    ...new Set([...visitsByMonth.keys(), ...salesByMonthCount.keys()]),
  ].sort();

  const funnel = {
    notStarted: (pp || []).filter((p) => p.development_status === "NOT_STARTED")
      .length,
    visited: (pp || []).filter((p) =>
      ["FIRST_VISIT", "FOLLOW_UP"].includes(p.development_status)
    ).length,
    sampled: (pp || []).filter(
      (p) =>
        p.sample_given_at ||
        ["SAMPLE_GIVEN", "SAMPLE_UNDER_TRIAL"].includes(p.development_status)
    ).length,
    trial: (pp || []).filter((p) =>
      ["PRODUCT_STARTED"].includes(p.development_status)
    ).length,
    converted: (pp || []).filter((p) =>
      ["CONVERTED", "REGULAR_SALE"].includes(p.development_status)
    ).length,
  };

  const samplesGiven = Math.max(
    (samples || []).length,
    (pp || []).filter((p) => p.sample_given_at).length
  );
  const samplesConverted = (pp || []).filter(
    (p) => p.sample_given_at && Number(p.total_sales_value) > 0
  ).length;

  return {
    salesByMonth: [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, salesValue]) => ({ month, sales: salesValue })),
    salesBySalesman: bySalesman.sort((a, b) => b.sales - a.sales),
    salesByProduct: byProduct.sort((a, b) => b.sales - a.sales),
    targetVsActual: bySalesman.map((s) => ({
      name: s.name,
      target: s.target,
      actual: s.sales,
    })),
    visitsVsSales: months.map((month) => ({
      month,
      visits: visitsByMonth.get(month) || 0,
      sales: salesByMonthCount.get(month) || 0,
    })),
    samplesVsConversion: [
      { name: "Samples given", value: samplesGiven },
      { name: "Samples converted", value: samplesConverted },
    ],
    funnel: [
      { stage: "Not started", value: funnel.notStarted },
      { stage: "Visited", value: funnel.visited },
      { stage: "Sampled", value: funnel.sampled },
      { stage: "Trial", value: funnel.trial },
      { stage: "Converted", value: funnel.converted },
    ],
    ranking: bySalesman
      .map((s) => ({
        name: s.name,
        achievement: s.target > 0 ? (s.sales / s.target) * 100 : 0,
        sales: s.sales,
      }))
      .sort((a, b) => b.achievement - a.achievement),
  };
}
