"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { AttentionSeverity, InterventionItem } from "@/types/sales";

export async function getOwnerInterventionList(
  companyIds: string[]
): Promise<InterventionItem[]> {
  await requireProfile();
  const supabase = await createClient();

  const { data: rules } = await supabase
    .from("crm_intervention_rules")
    .select("*")
    .eq("is_active", true);

  const { data: parties } = await supabase
    .from("crm_parties")
    .select("id, party_name, company_id, status")
    .in("company_id", companyIds);

  const { data: pp } = await supabase
    .from("crm_party_products")
    .select(
      "*, product:crm_products(product_name), party:crm_parties(party_name,company_id)"
    )
    .in("company_id", companyIds)
    .eq("is_active", true);

  const { data: assignments } = await supabase
    .from("crm_party_salesmen")
    .select("party_id, product_id, salesman:crm_salesmen(name)")
    .in("company_id", companyIds)
    .eq("is_active", true);

  const { data: followups } = await supabase
    .from("crm_followups")
    .select("party_id, followup_date, is_completed")
    .in("company_id", companyIds)
    .eq("is_completed", false);

  const items: InterventionItem[] = [];
  const today = new Date();
  const inactiveDays =
    rules?.find((r) => r.code === "INACTIVE_PARTY")?.threshold_days || 30;
  const highVisits =
    rules?.find((r) => r.code === "HIGH_VISITS_NO_SALES")?.threshold_visits || 5;

  for (const row of pp || []) {
    const salesman = (assignments || []).find(
      (a) => a.party_id === row.party_id && a.product_id === row.product_id
    );
    const salesmanRel = salesman?.salesman as
      | { name?: string }
      | { name?: string }[]
      | null
      | undefined;
    const salesmanName = Array.isArray(salesmanRel)
      ? salesmanRel[0]?.name || null
      : salesmanRel?.name || null;
    const productRel = row.product as
      | { product_name?: string }
      | { product_name?: string }[]
      | null
      | undefined;
    const partyRel = row.party as
      | { party_name?: string }
      | { party_name?: string }[]
      | null
      | undefined;
    const productName = Array.isArray(productRel)
      ? productRel[0]?.product_name
      : productRel?.product_name;
    const partyName =
      (Array.isArray(partyRel)
        ? partyRel[0]?.party_name
        : partyRel?.party_name) || "Party";

    if (
      Number(row.total_visits) >= highVisits &&
      Number(row.total_sales_value) === 0
    ) {
      items.push({
        party_id: row.party_id,
        party_name: partyName,
        company_id: row.company_id,
        product_id: row.product_id,
        product_name: productName || null,
        salesman_name: salesmanName,
        severity: "RED",
        reason: "High visits + no sales",
        rule_code: "HIGH_VISITS_NO_SALES",
        metric: `${row.total_visits} visits / ₹0 sales`,
      });
    }

    if (
      row.sample_given_at &&
      !["CONVERTED", "REGULAR_SALE", "PRODUCT_STARTED"].includes(
        row.development_status
      ) &&
      Number(row.total_sales_value) === 0
    ) {
      items.push({
        party_id: row.party_id,
        party_name: partyName,
        company_id: row.company_id,
        product_id: row.product_id,
        product_name: productName || null,
        salesman_name: salesmanName,
        severity: "AMBER",
        reason: "Sample given + no conversion",
        rule_code: "SAMPLE_NO_CONVERSION",
        metric: `Sample ${new Date(row.sample_given_at).toLocaleDateString()}`,
      });

      const hasFollowup = (followups || []).some(
        (f) => f.party_id === row.party_id
      );
      if (!hasFollowup) {
        items.push({
          party_id: row.party_id,
          party_name: partyName,
          company_id: row.company_id,
          product_id: row.product_id,
          product_name: productName || null,
          salesman_name: salesmanName,
          severity: "AMBER",
          reason: "No follow-up after sample",
          rule_code: "NO_FOLLOWUP_AFTER_SAMPLE",
          metric: "No open follow-up",
        });
      }
    }

    if (
      ["PRODUCT_STARTED", "REGULAR_SALE"].includes(row.development_status) &&
      row.last_sale_at
    ) {
      const days =
        (today.getTime() - new Date(row.last_sale_at).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days >= 30) {
        items.push({
          party_id: row.party_id,
          party_name: partyName,
          company_id: row.company_id,
          product_id: row.product_id,
          product_name: productName || null,
          salesman_name: salesmanName,
          severity: "BLUE",
          reason: "Product started + no recent sale",
          rule_code: "PRODUCT_STARTED_NO_RECENT_SALE",
          metric: `${Math.floor(days)} days since last sale`,
        });
      }
    }

    if (row.last_visit_at) {
      const days =
        (today.getTime() - new Date(row.last_visit_at).getTime()) /
        (1000 * 60 * 60 * 24);
      if (days >= inactiveDays) {
        items.push({
          party_id: row.party_id,
          party_name: partyName,
          company_id: row.company_id,
          product_id: row.product_id,
          product_name: productName || null,
          salesman_name: salesmanName,
          severity: "GREY",
          reason: "Inactive party",
          rule_code: "INACTIVE_PARTY",
          metric: `${Math.floor(days)} days since last visit`,
        });
      }
    } else if (Number(row.total_visits) === 0) {
      items.push({
        party_id: row.party_id,
        party_name: partyName,
        company_id: row.company_id,
        product_id: row.product_id,
        product_name: productName || null,
        salesman_name: salesmanName,
        severity: "GREY",
        reason: "No visit / inactive party",
        rule_code: "INACTIVE_PARTY",
        metric: "Never visited",
      });
    }
  }

  // Parties with no product assignment / never visited
  for (const party of parties || []) {
    const hasPp = (pp || []).some((p) => p.party_id === party.id);
    if (!hasPp) {
      items.push({
        party_id: party.id,
        party_name: party.party_name,
        company_id: party.company_id,
        product_id: null,
        product_name: null,
        salesman_name: null,
        severity: "GREY",
        reason: "No product development started",
        rule_code: "INACTIVE_PARTY",
        metric: party.status,
      });
    }
  }

  const severityRank: Record<AttentionSeverity, number> = {
    RED: 0,
    AMBER: 1,
    BLUE: 2,
    GREY: 3,
    GREEN: 4,
  };
  return items.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity]
  );
}

export async function getPerformanceReports(companyIds: string[]) {
  await requireProfile();
  const supabase = await createClient();
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);
  const from = `${month}-01`;

  const [
    { data: salesmen },
    { data: products },
    { data: sales },
    { data: visits },
    { data: pp },
    { data: incentives },
  ] = await Promise.all([
    supabase
      .from("crm_salesmen")
      .select("id,name,employee_id,company_id,monthly_target,status")
      .in("company_id", companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_products")
      .select("id,product_name,product_code,company_id,monthly_target")
      .in("company_id", companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_sales")
      .select("*")
      .in("company_id", companyIds)
      .gte("sale_date", from),
    supabase
      .from("crm_visits")
      .select("id,salesman_id,party_id,product_id,gps_verified,status,duration_seconds,visit_date")
      .in("company_id", companyIds)
      .gte("visit_date", from),
    supabase
      .from("crm_party_products")
      .select("*")
      .in("company_id", companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_incentive_calculations")
      .select("*")
      .in("company_id", companyIds)
      .eq("year_month", month),
  ]);

  const salesmanPerf = (salesmen || []).map((s) => {
    const sSales = (sales || []).filter((x) => x.salesman_id === s.id);
    const sVisits = (visits || []).filter(
      (x) => x.salesman_id === s.id && x.gps_verified
    );
    const value = sSales.reduce((a, x) => a + Number(x.sales_value), 0);
    const target = Number(s.monthly_target || 0);
    const ach = target > 0 ? (value / target) * 100 : 0;
    const inc = (incentives || [])
      .filter((i) => i.salesman_id === s.id)
      .reduce((a, i) => a + Number(i.calculated_amount), 0);
    return {
      ...s,
      visits: sVisits.length,
      salesValue: value,
      salesCount: sSales.length,
      target,
      achievement: ach,
      incentive: inc,
      flag:
        sVisits.length >= 10 && value === 0
          ? "HIGH_ACTIVITY_LOW_SALES"
          : ach >= 100
            ? "ON_TARGET"
            : ach < 50 && sVisits.length < 5
              ? "LOW_ACTIVITY_LOW_SALES"
              : "WATCH",
    };
  });

  const productPerf = (products || []).map((p) => {
    const pSales = (sales || []).filter((x) => x.product_id === p.id);
    const pVisits = (visits || []).filter((x) => x.product_id === p.id);
    const value = pSales.reduce((a, x) => a + Number(x.sales_value), 0);
    const conversions = (pp || []).filter(
      (x) =>
        x.product_id === p.id &&
        ["CONVERTED", "REGULAR_SALE"].includes(x.development_status)
    ).length;
    return {
      ...p,
      salesValue: value,
      visits: pVisits.length,
      conversions,
      samples: (pp || []).filter(
        (x) => x.product_id === p.id && x.sample_given_at
      ).length,
    };
  });

  return {
    month,
    salesmanPerf,
    productPerf,
    totals: {
      salesValue: (sales || []).reduce((a, s) => a + Number(s.sales_value), 0),
      visits: (visits || []).filter((v) => v.gps_verified).length,
      incentives: (incentives || []).reduce(
        (a, i) => a + Number(i.calculated_amount),
        0
      ),
    },
  };
}
