"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { IntelligenceSettings } from "@/types/intelligence";

const DEFAULTS: Omit<IntelligenceSettings, "id" | "company_id"> = {
  inactive_days: 21,
  high_visits_no_sales: 5,
  single_visit_ignore_days: 14,
  sample_no_followup_days: 7,
  high_potential_value: 100000,
  high_potential_min_visits: 3,
  product_started_stale_days: 30,
  hot_min_visits: 3,
  hot_max_days_since_visit: 14,
  warm_max_days_since_visit: 30,
  cold_max_days_since_visit: 60,
  active_customer_min_sales: 1,
  inactive_customer_days: 45,
};

export async function getIntelligenceSettings(
  companyId?: string | null
): Promise<IntelligenceSettings> {
  await requireProfile();
  const supabase = await createClient();

  if (companyId) {
    const { data } = await supabase
      .from("crm_intelligence_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (data) return data as IntelligenceSettings;
  }

  const { data: global } = await supabase
    .from("crm_intelligence_settings")
    .select("*")
    .is("company_id", null)
    .maybeSingle();

  if (global) return global as IntelligenceSettings;

  return {
    id: "defaults",
    company_id: null,
    ...DEFAULTS,
  };
}

export async function upsertIntelligenceSettings(
  input: Partial<IntelligenceSettings> & { company_id?: string | null }
) {
  const profile = await requireProfile();
  if (!["OWNER", "ADMIN"].includes(profile.role)) throw new Error("Forbidden");
  const supabase = await createClient();

  const companyId = input.company_id ?? null;
  const existing = await getIntelligenceSettings(companyId);

  const payload = {
    inactive_days: Number(input.inactive_days ?? existing.inactive_days),
    high_visits_no_sales: Number(
      input.high_visits_no_sales ?? existing.high_visits_no_sales
    ),
    single_visit_ignore_days: Number(
      input.single_visit_ignore_days ?? existing.single_visit_ignore_days
    ),
    sample_no_followup_days: Number(
      input.sample_no_followup_days ?? existing.sample_no_followup_days
    ),
    high_potential_value: Number(
      input.high_potential_value ?? existing.high_potential_value
    ),
    high_potential_min_visits: Number(
      input.high_potential_min_visits ?? existing.high_potential_min_visits
    ),
    product_started_stale_days: Number(
      input.product_started_stale_days ?? existing.product_started_stale_days
    ),
    hot_min_visits: Number(input.hot_min_visits ?? existing.hot_min_visits),
    hot_max_days_since_visit: Number(
      input.hot_max_days_since_visit ?? existing.hot_max_days_since_visit
    ),
    warm_max_days_since_visit: Number(
      input.warm_max_days_since_visit ?? existing.warm_max_days_since_visit
    ),
    cold_max_days_since_visit: Number(
      input.cold_max_days_since_visit ?? existing.cold_max_days_since_visit
    ),
    active_customer_min_sales: Number(
      input.active_customer_min_sales ?? existing.active_customer_min_sales
    ),
    inactive_customer_days: Number(
      input.inactive_customer_days ?? existing.inactive_customer_days
    ),
  };

  let data;
  if (existing.id !== "defaults" && existing.company_id === companyId) {
    const res = await supabase
      .from("crm_intelligence_settings")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } else {
    const res = await supabase
      .from("crm_intelligence_settings")
      .insert({ ...payload, company_id: companyId })
      .select("*")
      .single();
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  }

  await supabase.rpc("crm_write_audit_log", {
    p_action: "INTELLIGENCE_SETTINGS_UPDATED",
    p_module: "intelligence",
    p_company_id: companyId,
    p_record_type: "crm_intelligence_settings",
    p_record_id: data.id,
    p_metadata: { old_value: existing, new_value: data },
  });

  revalidatePath("/settings/intelligence");
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return data as IntelligenceSettings;
}
