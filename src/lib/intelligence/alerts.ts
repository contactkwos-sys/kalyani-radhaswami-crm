"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { getIntelligenceSettings } from "@/lib/intelligence/settings";
import { daysBetween, todayISO } from "@/lib/intelligence/filters";
import type { ManagementAlert } from "@/types/intelligence";

export async function getManagementAlerts(
  companyIds: string[]
): Promise<ManagementAlert[]> {
  await requireProfile();
  const supabase = await createClient();
  const settings = await getIntelligenceSettings(companyIds[0] || null);
  const now = new Date();
  const today = todayISO();
  const month = today.slice(0, 7);
  const alerts: ManagementAlert[] = [];

  const [
    { data: parties },
    { data: pp },
    { data: products },
    { data: salesmen },
    { data: followups },
    { data: sales },
    { data: assignments },
  ] = await Promise.all([
    supabase
      .from("crm_parties")
      .select("id, party_name, company_id, potential_monthly_business")
      .in("company_id", companyIds),
    supabase
      .from("crm_party_products")
      .select("*, product:crm_products(product_name)")
      .in("company_id", companyIds)
      .eq("is_active", true),
    supabase
      .from("crm_products")
      .select("id, product_name, company_id, status")
      .in("company_id", companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_salesmen")
      .select("id, name, company_id, monthly_target, status")
      .in("company_id", companyIds)
      .eq("status", "ACTIVE"),
    supabase
      .from("crm_followups")
      .select("id, party_id, followup_date, is_completed, salesman_id")
      .in("company_id", companyIds)
      .eq("is_completed", false),
    supabase
      .from("crm_sales")
      .select("salesman_id, sales_value, sale_date")
      .in("company_id", companyIds)
      .gte("sale_date", `${month}-01`),
    supabase
      .from("crm_party_salesmen")
      .select("party_id, product_id, salesman_id")
      .in("company_id", companyIds)
      .eq("is_active", true),
  ]);

  for (const row of pp || []) {
    const party = (parties || []).find((p) => p.id === row.party_id);
    if (!party) continue;
    const productRel = row.product as
      | { product_name?: string }
      | { product_name?: string }[]
      | null;
    const productName = Array.isArray(productRel)
      ? productRel[0]?.product_name
      : productRel?.product_name;

    if (
      Number(row.total_visits) >= settings.high_visits_no_sales &&
      Number(row.total_sales_value) === 0
    ) {
      alerts.push({
        id: `hv-${row.id}`,
        severity: "RED",
        title: `${party.party_name} visited ${row.total_visits} times but no order generated.`,
        detail: productName || "Product",
        href: `/parties/${party.id}/360`,
        entity_type: "party",
        entity_id: party.id,
        rule_code: "HIGH_VISITS_NO_SALES",
      });
    }

    if (
      Number(row.total_visits) === 1 &&
      row.first_visit_at &&
      daysBetween(new Date(row.first_visit_at), now) >=
        settings.single_visit_ignore_days &&
      Number(row.total_sales_value) === 0
    ) {
      alerts.push({
        id: `sv-${row.id}`,
        severity: "YELLOW",
        title: `${party.party_name} visited only once and then ignored.`,
        detail: `Since ${new Date(row.first_visit_at).toLocaleDateString()}`,
        href: `/parties/${party.id}/360`,
        entity_type: "party",
        entity_id: party.id,
        rule_code: "SINGLE_VISIT_IGNORED",
      });
    }

    if (row.sample_given_at && Number(row.total_sales_value) === 0) {
      const days = daysBetween(new Date(row.sample_given_at), now);
      const hasFu = (followups || []).some((f) => f.party_id === row.party_id);
      if (!hasFu && days >= settings.sample_no_followup_days) {
        alerts.push({
          id: `sf-${row.id}`,
          severity: "YELLOW",
          title: `Sample given ${days} days ago but no follow-up.`,
          detail: `${party.party_name} · ${productName || ""}`,
          href: `/parties/${party.id}/360`,
          entity_type: "party",
          entity_id: party.id,
          rule_code: "SAMPLE_NO_FOLLOWUP",
        });
      }
    }

    if (
      ["PRODUCT_STARTED", "REGULAR_SALE"].includes(row.development_status) &&
      row.last_sale_at &&
      daysBetween(new Date(row.last_sale_at), now) >=
        settings.product_started_stale_days
    ) {
      alerts.push({
        id: `ps-${row.id}`,
        severity: "YELLOW",
        title: `${party.party_name}: product started but sales stopped.`,
        detail: productName || "",
        href: `/parties/${party.id}/360`,
        entity_type: "party",
        entity_id: party.id,
        rule_code: "PRODUCT_STARTED_STALE",
      });
    }

    if (row.last_visit_at) {
      const days = daysBetween(new Date(row.last_visit_at), now);
      if (days >= settings.inactive_days) {
        alerts.push({
          id: `nv-${row.id}`,
          severity: "RED",
          title: `${party.party_name} has not been visited for ${days} days.`,
          detail: productName || "",
          href: `/parties/${party.id}/360`,
          entity_type: "party",
          entity_id: party.id,
          rule_code: "INACTIVE_PARTY",
        });
      }
    }
  }

  for (const party of parties || []) {
    const visits = (pp || [])
      .filter((p) => p.party_id === party.id)
      .reduce((a, p) => a + Number(p.total_visits), 0);
    if (
      Number(party.potential_monthly_business) >= settings.high_potential_value &&
      visits < settings.high_potential_min_visits
    ) {
      alerts.push({
        id: `hp-${party.id}`,
        severity: "YELLOW",
        title: `${party.party_name} has high potential but insufficient visits.`,
        detail: `Potential ₹${Number(party.potential_monthly_business).toLocaleString("en-IN")} · ${visits} visits`,
        href: `/parties/${party.id}/360`,
        entity_type: "party",
        entity_id: party.id,
        rule_code: "HIGH_POTENTIAL_LOW_VISITS",
      });
    }
  }

  for (const f of followups || []) {
    if (f.followup_date < today) {
      const party = (parties || []).find((p) => p.id === f.party_id);
      alerts.push({
        id: `fu-${f.id}`,
        severity: "RED",
        title: `Follow-up overdue for ${party?.party_name || "party"}.`,
        detail: `Due ${f.followup_date}`,
        href: `/parties/${f.party_id}/360`,
        entity_type: "party",
        entity_id: f.party_id,
        rule_code: "OVERDUE_FOLLOWUP",
      });
    }
  }

  for (const product of products || []) {
    const assigned = (assignments || []).filter((a) => a.product_id === product.id);
    const active = (pp || []).filter(
      (p) =>
        p.product_id === product.id &&
        (Number(p.total_visits) > 0 || Number(p.total_sales_value) > 0)
    );
    if (assigned.length >= 20 && active.length < assigned.length * 0.2) {
      alerts.push({
        id: `pr-${product.id}`,
        severity: "YELLOW",
        title: `${product.product_name} has ${assigned.length} assigned parties but only ${active.length} are active.`,
        detail: "Needs coverage review",
        href: `/products/${product.id}`,
        entity_type: "product",
        entity_id: product.id,
        rule_code: "PRODUCT_LOW_ACTIVITY",
      });
    }
  }

  for (const sm of salesmen || []) {
    const value = (sales || [])
      .filter((s) => s.salesman_id === sm.id)
      .reduce((a, s) => a + Number(s.sales_value), 0);
    const target = Number(sm.monthly_target || 0);
    const ach = target > 0 ? (value / target) * 100 : 0;
    if (ach >= 80) {
      alerts.push({
        id: `ach-${sm.id}`,
        severity: "GREEN",
        title: `${sm.name} achieved ${ach.toFixed(0)}% of monthly target.`,
        detail: `₹${value.toLocaleString("en-IN")} / ₹${target.toLocaleString("en-IN")}`,
        href: `/salesmen/${sm.id}`,
        entity_type: "salesman",
        entity_id: sm.id,
        rule_code: "TARGET_ON_TRACK",
      });
    } else if (target > 0 && ach < 40) {
      alerts.push({
        id: `low-${sm.id}`,
        severity: "RED",
        title: `${sm.name} is significantly below target (${ach.toFixed(0)}%).`,
        detail: `₹${value.toLocaleString("en-IN")} / ₹${target.toLocaleString("en-IN")}`,
        href: `/salesmen/${sm.id}`,
        entity_type: "salesman",
        entity_id: sm.id,
        rule_code: "LOW_TARGET_ACHIEVEMENT",
      });
    }
  }

  const rank = { RED: 0, YELLOW: 1, GREEN: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
