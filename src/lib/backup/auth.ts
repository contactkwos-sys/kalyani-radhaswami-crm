import { requireProfile } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function requireBackupAccess(
  action: "export" | "restore" | "settings" | "drive" = "export"
): Promise<Profile> {
  const profile = await requireProfile();

  if (profile.role === "SALESMAN" || profile.role === "VIEWER") {
    throw new Error("Backup and restore are not available for your role.");
  }

  if (action === "restore" || action === "drive") {
    if (profile.role !== "OWNER") {
      throw new Error("Only the Owner can perform restore and Google Drive setup.");
    }
    return profile;
  }

  if (["OWNER","CEO_1","CEO_2","CEO_3","ADMIN"].includes(profile.role)) {
    return profile;
  }

  if (profile.role === "ACCOUNTANT" && action === "export") {
    // Settings RLS is owner/admin-only — use service client for the permission flag.
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_backup_settings")
      .select("accountant_export_allowed")
      .is("company_id", null)
      .maybeSingle();
    if (data?.accountant_export_allowed) return profile;
    throw new Error("Accountant export is not enabled by the Owner.");
  }

  throw new Error("Forbidden");
}

export async function auditBackup(
  action: string,
  metadata: Record<string, unknown>,
  companyId?: string | null,
  recordId?: string | null
) {
  const supabase = await createClient();
  await supabase.rpc("crm_write_audit_log", {
    p_action: action,
    p_module: "backup",
    p_company_id: companyId ?? null,
    p_record_type: "crm_backup_jobs",
    p_record_id: recordId ?? null,
    p_metadata: metadata,
  });
}
