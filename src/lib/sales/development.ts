"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { DevStatus, IncentiveRule } from "@/types/sales";

async function requireOwnerAdmin() {
  const profile = await requireProfile();
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(profile.role)) throw new Error("Forbidden");
  return profile;
}

const ruleSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().min(1).max(160),
  rule_type: z.enum([
    "PERCENT_OF_SALES",
    "FIXED_PER_QTY",
    "FIXED_PER_CONVERTED_PARTY",
    "PRODUCT_SPECIFIC",
    "TARGET_SLAB",
  ]),
  product_id: z.string().uuid().nullable().optional(),
  salesman_id: z.string().uuid().nullable().optional(),
  percent_rate: z.coerce.number().nullable().optional(),
  fixed_amount: z.coerce.number().nullable().optional(),
  slabs: z
    .array(
      z.object({
        min_pct: z.number(),
        max_pct: z.number(),
        rate: z.number(),
      })
    )
    .default([]),
  is_active: z.boolean().default(true),
  priority: z.coerce.number().default(100),
  notes: z.string().nullable().optional(),
});

export async function listIncentiveRules(companyIds: string[]) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_incentive_rules")
    .select("*")
    .in("company_id", companyIds)
    .order("priority");
  if (error) throw new Error(error.message);
  return (data || []) as IncentiveRule[];
}

export async function upsertIncentiveRule(input: unknown, id?: string) {
  const profile = await requireOwnerAdmin();
  const parsed = ruleSchema.parse(input);
  const supabase = await createClient();
  const payload = {
    ...parsed,
    product_id: parsed.product_id || null,
    salesman_id: parsed.salesman_id || null,
    percent_rate: parsed.percent_rate ?? null,
    fixed_amount: parsed.fixed_amount ?? null,
    notes: parsed.notes || null,
    created_by: profile.id,
  };

  if (id) {
    const { data: before } = await supabase
      .from("crm_incentive_rules")
      .select("*")
      .eq("id", id)
      .single();
    const { data, error } = await supabase
      .from("crm_incentive_rules")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await supabase.rpc("crm_write_audit_log", {
      p_action: "INCENTIVE_RULE_UPDATED",
      p_module: "incentives",
      p_company_id: parsed.company_id,
      p_record_type: "crm_incentive_rules",
      p_record_id: id,
      p_metadata: { old_value: before, new_value: data },
    });
    revalidatePath("/settings/incentives");
    return data as IncentiveRule;
  }

  const { data, error } = await supabase
    .from("crm_incentive_rules")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase.rpc("crm_write_audit_log", {
    p_action: "INCENTIVE_RULE_CREATED",
    p_module: "incentives",
    p_company_id: parsed.company_id,
    p_record_type: "crm_incentive_rules",
    p_record_id: data.id,
    p_metadata: { name: parsed.name, rule_type: parsed.rule_type },
  });
  revalidatePath("/settings/incentives");
  return data as IncentiveRule;
}

export async function setPartyProductDevelopment(input: {
  party_id: string;
  product_id: string;
  status: DevStatus;
  notes?: string;
}) {
  const profile = await requireProfile();
  if (
    !["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER", "SALESMAN"].includes(profile.role)
  ) {
    throw new Error("Forbidden");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_set_party_product_status", {
    p_party_id: input.party_id,
    p_product_id: input.product_id,
    p_to_status: input.status,
    p_source_module: "manual",
    p_source_record_id: null,
    p_notes: input.notes || null,
  });
  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "PARTY_PRODUCT_STATUS_CHANGED",
    p_module: "party_development",
    p_company_id: null,
    p_record_type: "crm_party_products",
    p_record_id: null,
    p_metadata: input,
  });

  revalidatePath(`/parties/${input.party_id}`);
  revalidatePath("/reports/party-development");
}

export async function getParty360(partyId: string) {
  await requireProfile();
  const supabase = await createClient();

  const [
    { data: party, error: partyErr },
    { data: assignments },
    { data: visits },
    { data: sales },
    { data: history },
    { data: followups },
    { data: samples },
  ] = await Promise.all([
    supabase
      .from("crm_parties")
      .select("*, company:crm_companies(id,name,code)")
      .eq("id", partyId)
      .maybeSingle(),
    supabase
      .from("crm_party_salesmen")
      .select(
        "*, salesman:crm_salesmen(id,name,employee_id), product:crm_products(id,product_name,product_code)"
      )
      .eq("party_id", partyId)
      .eq("is_active", true),
    supabase
      .from("crm_visits")
      .select(
        "*, salesman:crm_salesmen(name), product:crm_products(product_name), feedback:crm_visit_feedback(*)"
      )
      .eq("party_id", partyId)
      .order("start_at", { ascending: true }),
    supabase
      .from("crm_sales")
      .select(
        "*, product:crm_products(product_name,product_code), salesman:crm_salesmen(name)"
      )
      .eq("party_id", partyId)
      .order("sale_date", { ascending: true }),
    supabase
      .from("crm_party_product_history")
      .select("*, product:crm_products(product_name)")
      .eq("party_id", partyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("crm_followups")
      .select("*")
      .eq("party_id", partyId)
      .order("followup_date"),
    supabase
      .from("crm_samples")
      .select("*")
      .eq("party_id", partyId),
  ]);

  if (partyErr || !party) throw new Error(partyErr?.message || "Party not found");

  const { data: ppStatuses } = await supabase
    .from("crm_party_products")
    .select("*, product:crm_products(product_name,product_code)")
    .eq("party_id", partyId)
    .eq("is_active", true);

  const totalVisitSeconds = (visits || [])
    .filter((v) => v.duration_seconds != null)
    .reduce((a, v) => a + Number(v.duration_seconds), 0);

  const totalSales = (sales || []).reduce(
    (a, s) => a + Number(s.sales_value),
    0
  );

  const openFollowups = (followups || []).filter((f) => !f.is_completed);
  const nextFollowup = openFollowups.sort((a, b) =>
    a.followup_date.localeCompare(b.followup_date)
  )[0];
  const lastFollowup = [...(followups || [])]
    .sort((a, b) => b.followup_date.localeCompare(a.followup_date))[0];

  return {
    party,
    assignments: assignments || [],
    productStatuses: ppStatuses || [],
    visits: visits || [],
    sales: sales || [],
    history: history || [],
    samples: samples || [],
    followups: followups || [],
    stats: {
      totalVisits: (visits || []).filter((v) => v.gps_verified).length,
      totalTimeHours: Math.round((totalVisitSeconds / 3600) * 10) / 10,
      samples: (samples || []).length,
      salesValue: totalSales,
      converted: (ppStatuses || []).some((p) =>
        ["CONVERTED", "REGULAR_SALE"].includes(p.development_status)
      ),
      lastFollowup: lastFollowup?.followup_date || null,
      nextFollowup: nextFollowup?.followup_date || null,
    },
  };
}
