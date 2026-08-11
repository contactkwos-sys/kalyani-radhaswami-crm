"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type VisitRow = {
  id: string;
  company_id: string;
  salesman_id: string;
  party_id: string;
  product_id: string | null;
  visit_date: string;
  status: string;
  gps_status: string;
  start_at: string | null;
  end_at: string | null;
  duration_seconds: number | null;
  start_distance_meters: number | null;
  allowed_radius_meters: number;
  gps_verified: boolean;
  rejection_reason: string | null;
};

async function resolveSalesmanId(preferred?: string | null) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (preferred) {
    const { data } = await supabase
      .from("crm_salesmen")
      .select("id, user_id, company_id")
      .eq("id", preferred)
      .maybeSingle();
    if (!data) throw new Error("Salesman not found");
    if (
      profile.role === "SALESMAN" &&
      data.user_id !== profile.id
    ) {
      throw new Error("Forbidden");
    }
    return data;
  }

  const { data } = await supabase
    .from("crm_salesmen")
    .select("id, user_id, company_id")
    .eq("user_id", profile.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!data) throw new Error("No salesman profile linked to this user");
  return data;
}

export async function createDailyPlan(input: {
  salesman_id?: string;
  plan_date: string;
  daily_sales_target: number;
  party_ids: string[];
  notes?: string;
}) {
  const profile = await requireProfile();
  const salesman = await resolveSalesmanId(input.salesman_id);
  const supabase = await createClient();

  const { data: plan, error } = await supabase
    .from("crm_daily_plans")
    .upsert(
      {
        company_id: salesman.company_id,
        salesman_id: salesman.id,
        plan_date: input.plan_date,
        daily_sales_target: input.daily_sales_target,
        planned_parties_count: input.party_ids.length,
        status: "PLANNED",
        notes: input.notes || null,
        created_by: profile.id,
      },
      { onConflict: "salesman_id,plan_date" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("crm_planned_visits").delete().eq("daily_plan_id", plan.id);

  if (input.party_ids.length) {
    const rows = input.party_ids.map((party_id, index) => ({
      company_id: salesman.company_id,
      daily_plan_id: plan.id,
      party_id,
      sequence_no: index + 1,
      status: "PLANNED",
    }));
    const { error: pvError } = await supabase.from("crm_planned_visits").insert(rows);
    if (pvError) throw new Error(pvError.message);
  }

  await supabase.rpc("crm_write_audit_log", {
    p_action: "DAILY_PLAN_SAVED",
    p_module: "visits",
    p_company_id: salesman.company_id,
    p_record_type: "crm_daily_plans",
    p_record_id: plan.id,
    p_metadata: { plan_date: input.plan_date, parties: input.party_ids.length },
  });

  revalidatePath("/today");
  return plan;
}

export async function startVisit(input: {
  party_id: string;
  salesman_id?: string;
  product_id?: string | null;
  planned_visit_id?: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
}) {
  await requireProfile();
  const salesman = await resolveSalesmanId(input.salesman_id);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("crm_start_visit", {
    p_party_id: input.party_id,
    p_salesman_id: salesman.id,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_accuracy_meters: input.accuracy_meters ?? null,
    p_product_id: input.product_id || null,
    p_planned_visit_id: input.planned_visit_id || null,
    p_client_reported_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  const visit = (Array.isArray(data) ? data[0] : data) as VisitRow;

  revalidatePath("/today");
  revalidatePath(`/parties/${input.party_id}`);
  revalidatePath(`/visits/${visit.id}`);
  return visit;
}

export async function endVisit(input: {
  visit_id: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
}) {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_end_visit", {
    p_visit_id: input.visit_id,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_accuracy_meters: input.accuracy_meters ?? null,
    p_client_reported_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  const visit = (Array.isArray(data) ? data[0] : data) as VisitRow;
  revalidatePath("/today");
  revalidatePath(`/visits/${visit.id}`);
  revalidatePath(`/visits/${visit.id}/feedback`);
  return visit;
}

const feedbackSchema = z.object({
  visit_id: z.string().uuid(),
  person_met: z.string().max(120).optional().nullable(),
  designation: z.string().max(80).optional().nullable(),
  discussion: z.string().max(4000).optional().nullable(),
  product_id: z.string().uuid().optional().nullable(),
  potential_quantity: z.coerce.number().optional().nullable(),
  potential_monthly_business: z.coerce.number().optional().nullable(),
  current_supplier: z.string().max(160).optional().nullable(),
  current_rate: z.coerce.number().optional().nullable(),
  our_rate: z.coerce.number().optional().nullable(),
  sample_required: z.coerce.boolean().optional(),
  sample_given: z.coerce.boolean().optional(),
  trial_required: z.coerce.boolean().optional(),
  trial_date: z.string().optional().nullable(),
  probability: z
    .enum(["P10", "P25", "P50", "P75", "P90", "CONVERTED"])
    .optional()
    .nullable(),
  reason_not_converting: z
    .enum([
      "PRICE",
      "QUALITY",
      "EXISTING_SUPPLIER",
      "CREDIT",
      "NO_REQUIREMENT",
      "COMPETITOR",
      "OTHER",
    ])
    .optional()
    .nullable(),
  remarks: z.string().max(4000).optional().nullable(),
  photo_url: z.string().optional().nullable(),
  voice_note_url: z.string().optional().nullable(),
  followup_date: z.string().optional().nullable(),
  followup_purpose: z.string().max(500).optional().nullable(),
  followup_priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional().nullable(),
});

function emptyToNull(v: unknown) {
  if (v === "" || v === undefined) return null;
  return v;
}

export async function saveVisitFeedback(raw: Record<string, unknown>) {
  const profile = await requireProfile();
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    cleaned[k] = emptyToNull(v);
  }
  if (cleaned.sample_required === "on" || cleaned.sample_required === "true")
    cleaned.sample_required = true;
  if (cleaned.sample_given === "on" || cleaned.sample_given === "true")
    cleaned.sample_given = true;
  if (cleaned.trial_required === "on" || cleaned.trial_required === "true")
    cleaned.trial_required = true;

  const parsed = feedbackSchema.parse(cleaned);
  const supabase = await createClient();

  const { data: visit, error: visitError } = await supabase
    .from("crm_visits")
    .select("*")
    .eq("id", parsed.visit_id)
    .single();
  if (visitError || !visit) throw new Error(visitError?.message || "Visit not found");
  if (visit.status !== "ENDED" || !visit.gps_verified) {
    throw new Error("Feedback allowed only after a GPS-verified ended visit");
  }

  const feedbackPayload = {
    company_id: visit.company_id,
    visit_id: parsed.visit_id,
    person_met: parsed.person_met || null,
    designation: parsed.designation || null,
    discussion: parsed.discussion || null,
    product_id: parsed.product_id || visit.product_id,
    potential_quantity: parsed.potential_quantity ?? null,
    potential_monthly_business: parsed.potential_monthly_business ?? null,
    current_supplier: parsed.current_supplier || null,
    current_rate: parsed.current_rate ?? null,
    our_rate: parsed.our_rate ?? null,
    sample_required: Boolean(parsed.sample_required),
    sample_given: Boolean(parsed.sample_given),
    trial_required: Boolean(parsed.trial_required),
    trial_date: parsed.trial_date || null,
    probability: parsed.probability || null,
    reason_not_converting: parsed.reason_not_converting || null,
    remarks: parsed.remarks || null,
    photo_url: parsed.photo_url || null,
    voice_note_url: parsed.voice_note_url || null,
  };

  const { error } = await supabase
    .from("crm_visit_feedback")
    .upsert(feedbackPayload, { onConflict: "visit_id" });
  if (error) throw new Error(error.message);

  if (feedbackPayload.sample_given) {
    await supabase.from("crm_samples").insert({
      company_id: visit.company_id,
      party_id: visit.party_id,
      salesman_id: visit.salesman_id,
      product_id: feedbackPayload.product_id,
      visit_id: visit.id,
    });
    await supabase
      .from("crm_parties")
      .update({ status: "SAMPLE" })
      .eq("id", visit.party_id)
      .in("status", ["NEW", "PROSPECT"]);
  }

  if (feedbackPayload.trial_required && feedbackPayload.trial_date) {
    await supabase.from("crm_trials").insert({
      company_id: visit.company_id,
      party_id: visit.party_id,
      salesman_id: visit.salesman_id,
      product_id: feedbackPayload.product_id,
      visit_id: visit.id,
      trial_date: feedbackPayload.trial_date,
      status: "PLANNED",
    });
    await supabase
      .from("crm_parties")
      .update({ status: "TRIAL" })
      .eq("id", visit.party_id)
      .in("status", ["NEW", "PROSPECT", "SAMPLE"]);
  }

  if (parsed.probability === "CONVERTED") {
    await supabase
      .from("crm_parties")
      .update({ status: "CONVERTED" })
      .eq("id", visit.party_id);
  }

  if (parsed.followup_date) {
    await supabase.from("crm_followups").insert({
      company_id: visit.company_id,
      party_id: visit.party_id,
      salesman_id: visit.salesman_id,
      visit_id: visit.id,
      followup_date: parsed.followup_date,
      purpose: parsed.followup_purpose || null,
      priority: parsed.followup_priority || "MEDIUM",
      created_by: profile.id,
    });
  }

  await supabase.rpc("crm_write_audit_log", {
    p_action: "VISIT_FEEDBACK_SAVED",
    p_module: "visits",
    p_company_id: visit.company_id,
    p_record_type: "crm_visit_feedback",
    p_record_id: visit.id,
    p_metadata: { party_id: visit.party_id },
  });

  revalidatePath(`/visits/${visit.id}`);
  revalidatePath(`/parties/${visit.party_id}`);
  revalidatePath("/follow-ups");
  revalidatePath("/today");
  return { ok: true };
}

export async function completeFollowup(id: string) {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("crm_followups")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/follow-ups");
}
