"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { CompanyScope } from "@/types/database";

const CAN_SELECT_ALL = new Set([
  "OWNER",
  "CEO_1",
  "CEO_2",
  "CEO_3",
  "ADMIN",
]);

export async function setCompanyScope(scope: CompanyScope, companyId?: string) {
  const profile = await requireProfile();
  if (scope === "ALL" && !CAN_SELECT_ALL.has(profile.role)) {
    throw new Error("Only Owner / CEO / Admin can select All Companies");
  }

  const supabase = await createClient();
  const updates: {
    company_scope: CompanyScope;
    preferred_company_id?: string | null;
  } = { company_scope: scope };

  if (scope === "ALL") {
    updates.preferred_company_id = null;
  } else if (companyId) {
    updates.preferred_company_id = companyId;
  }

  const { error } = await supabase
    .from("crm_profiles")
    .update(updates)
    .eq("id", profile.id);

  if (error) throw new Error(error.message);

  await supabase.rpc("crm_write_audit_log", {
    p_action: "COMPANY_SCOPE_CHANGED",
    p_module: "company",
    p_company_id: companyId || null,
    p_record_type: "profiles",
    p_record_id: profile.id,
    p_metadata: { scope, company_id: companyId || null },
  });

  revalidatePath("/", "layout");
}
