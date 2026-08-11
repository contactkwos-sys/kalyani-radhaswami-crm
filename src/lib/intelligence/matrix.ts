"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { MatrixStatus } from "@/types/intelligence";

export interface MatrixCell {
  party_id: string;
  product_id: string;
  status: MatrixStatus;
  development_status: string | null;
  total_visits: number;
  total_sales_value: number;
}

export async function getProductPartyMatrix(companyIds: string[]) {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: parties }, { data: products }, { data: pp }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("crm_parties")
        .select("id, party_name, company_id, status")
        .in("company_id", companyIds)
        .order("party_name")
        .limit(500),
      supabase
        .from("crm_products")
        .select("id, product_name, product_code, company_id")
        .in("company_id", companyIds)
        .eq("status", "ACTIVE")
        .order("product_name"),
      supabase
        .from("crm_party_products")
        .select(
          "party_id, product_id, development_status, matrix_status, total_visits, total_sales_value, is_active"
        )
        .in("company_id", companyIds)
        .eq("is_active", true),
      supabase
        .from("crm_party_salesmen")
        .select("party_id, product_id")
        .in("company_id", companyIds)
        .eq("is_active", true),
    ]);

  const cells: MatrixCell[] = [];
  for (const party of parties || []) {
    for (const product of (products || []).filter(
      (pr) => pr.company_id === party.company_id
    )) {
      const row = (pp || []).find(
        (p) => p.party_id === party.id && p.product_id === product.id
      );
      const assigned = (assignments || []).some(
        (a) =>
          a.party_id === party.id &&
          (a.product_id === product.id || a.product_id == null)
      );
      let status: MatrixStatus = "NOT_ASSIGNED";
      if (row?.matrix_status) status = row.matrix_status as MatrixStatus;
      else if (row || assigned) status = "ASSIGNED";

      if (status !== "NOT_ASSIGNED" || assigned || row) {
        cells.push({
          party_id: party.id,
          product_id: product.id,
          status,
          development_status: row?.development_status || null,
          total_visits: Number(row?.total_visits || 0),
          total_sales_value: Number(row?.total_sales_value || 0),
        });
      }
    }
  }

  return {
    parties: parties || [],
    products: products || [],
    cells,
  };
}

export async function getPartyProductHistory(partyId: string, productId: string) {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: party },
    { data: product },
    { data: pp },
    { data: visits },
    { data: sales },
    { data: history },
    { data: samples },
    { data: followups },
  ] = await Promise.all([
    supabase.from("crm_parties").select("*").eq("id", partyId).maybeSingle(),
    supabase.from("crm_products").select("*").eq("id", productId).maybeSingle(),
    supabase
      .from("crm_party_products")
      .select("*")
      .eq("party_id", partyId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("crm_visits")
      .select(
        "*, salesman:crm_salesmen(name), feedback:crm_visit_feedback(*)"
      )
      .eq("party_id", partyId)
      .eq("product_id", productId)
      .order("start_at", { ascending: true }),
    supabase
      .from("crm_sales")
      .select("*, salesman:crm_salesmen(name)")
      .eq("party_id", partyId)
      .eq("product_id", productId)
      .order("sale_date", { ascending: true }),
    supabase
      .from("crm_party_product_history")
      .select("*")
      .eq("party_id", partyId)
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_samples")
      .select("*")
      .eq("party_id", partyId)
      .eq("product_id", productId),
    supabase
      .from("crm_followups")
      .select("*")
      .eq("party_id", partyId)
      .order("followup_date"),
  ]);

  return {
    party,
    product,
    status: pp,
    visits: visits || [],
    sales: sales || [],
    history: history || [],
    samples: samples || [],
    followups: followups || [],
  };
}
