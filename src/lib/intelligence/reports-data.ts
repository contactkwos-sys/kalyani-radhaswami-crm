"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getIntelligenceSettings } from "@/lib/intelligence/settings";
import { daysBetween } from "@/lib/intelligence/filters";
import type { ReportFilters } from "@/types/intelligence";

export async function getSalesReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_sales")
    .select(
      "*, party:crm_parties(party_name), product:crm_products(product_name), salesman:crm_salesmen(name)"
    )
    .in("company_id", filters.companyIds)
    .gte("sale_date", filters.from)
    .lte("sale_date", filters.to)
    .order("sale_date", { ascending: false })
    .limit(1000);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.salesmanId) q = q.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getVisitsReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_visits")
    .select(
      "*, party:crm_parties(party_name), product:crm_products(product_name), salesman:crm_salesmen(name)"
    )
    .in("company_id", filters.companyIds)
    .gte("visit_date", filters.from)
    .lte("visit_date", filters.to)
    .order("visit_date", { ascending: false })
    .limit(1000);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.salesmanId) q = q.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getFollowupsReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  let q = supabase
    .from("crm_followups")
    .select(
      "*, party:crm_parties(party_name), salesman:crm_salesmen(name)"
    )
    .in("company_id", filters.companyIds)
    .gte("followup_date", filters.from)
    .lte("followup_date", filters.to)
    .order("followup_date")
    .limit(1000);
  if (filters.salesmanId) q = q.eq("salesman_id", filters.salesmanId);
  if (filters.partyId) q = q.eq("party_id", filters.partyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSamplesReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  const [{ data: samples }, { data: pp }] = await Promise.all([
    supabase
      .from("crm_samples")
      .select(
        "*, party:crm_parties(party_name), product:crm_products(product_name), salesman:crm_salesmen(name)"
      )
      .in("company_id", filters.companyIds)
      .limit(1000),
    supabase
      .from("crm_party_products")
      .select(
        "party_id, product_id, sample_given_at, total_sales_value, development_status, party:crm_parties(party_name), product:crm_products(product_name)"
      )
      .in("company_id", filters.companyIds)
      .not("sample_given_at", "is", null),
  ]);
  return { samples: samples || [], partyProducts: pp || [] };
}

export async function getIncentiveDetailReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  const month = filters.to.slice(0, 7);
  const yearStart =
    Number(month.slice(5, 7)) >= 4
      ? `${month.slice(0, 4)}-04-01`
      : `${Number(month.slice(0, 4)) - 1}-04-01`;

  const { data, error } = await supabase
    .from("crm_incentive_calculations")
    .select(
      "*, salesman:crm_salesmen(name), product:crm_products(product_name), sale:crm_sales(party_id, invoice_number, sale_date, party:crm_parties(party_name))"
    )
    .in("company_id", filters.companyIds)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const rows = data || [];
  const today = filters.to;
  return {
    rows,
    today: rows
      .filter((r) => {
        const sale = Array.isArray(r.sale) ? r.sale[0] : r.sale;
        return sale?.sale_date === today;
      })
      .reduce((a, r) => a + Number(r.calculated_amount), 0),
    month: rows
      .filter((r) => r.year_month === month)
      .reduce((a, r) => a + Number(r.calculated_amount), 0),
    ytd: rows
      .filter((r) => {
        const sale = Array.isArray(r.sale) ? r.sale[0] : r.sale;
        return sale?.sale_date && sale.sale_date >= yearStart;
      })
      .reduce((a, r) => a + Number(r.calculated_amount), 0),
  };
}

export async function getPartyDevelopmentReport(filters: ReportFilters) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_party_products")
    .select(
      "*, party:crm_parties(party_name, potential_monthly_business, status), product:crm_products(product_name)"
    )
    .in("company_id", filters.companyIds)
    .eq("is_active", true)
    .order("total_visits", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getInactiveAndHighVisitReport(companyIds: string[]) {
  await requireProfile();
  const settings = await getIntelligenceSettings(companyIds[0] || null);
  const supabase = await createClient();
  const now = new Date();
  const { data: pp } = await supabase
    .from("crm_party_products")
    .select(
      "*, party:crm_parties(party_name), product:crm_products(product_name)"
    )
    .in("company_id", companyIds)
    .eq("is_active", true);

  const inactive = [];
  const highVisit = [];
  for (const row of pp || []) {
    const party = Array.isArray(row.party) ? row.party[0] : row.party;
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    if (
      Number(row.total_visits) >= settings.high_visits_no_sales &&
      Number(row.total_sales_value) === 0
    ) {
      highVisit.push({
        party_id: row.party_id,
        party_name: party?.party_name,
        product_name: product?.product_name,
        visits: row.total_visits,
      });
    }
    if (row.last_visit_at) {
      const days = daysBetween(new Date(row.last_visit_at), now);
      if (days >= settings.inactive_days) {
        inactive.push({
          party_id: row.party_id,
          party_name: party?.party_name,
          product_name: product?.product_name,
          days,
        });
      }
    } else if (Number(row.total_visits) === 0) {
      inactive.push({
        party_id: row.party_id,
        party_name: party?.party_name,
        product_name: product?.product_name,
        days: null,
      });
    }
  }
  return { inactive, highVisit, settings };
}
