import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import type { LicenseStatus, LicenseView } from "@/types/database";

export async function refreshAndGetLicense(
  companyId: string
): Promise<LicenseView | null> {
  const admin = createServiceClient();

  // Recompute status from server clock via RPC
  await admin.rpc("crm_refresh_license_status", { p_company_id: companyId });

  const { data, error } = await admin.rpc("crm_get_license_for_company", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("get_license_for_company:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    company_id: row.company_id,
    status: row.status as LicenseStatus,
    trial_start_at: row.trial_start_at,
    trial_end_at: row.trial_end_at,
    trial_remaining_seconds: Number(row.trial_remaining_seconds || 0),
    activated_at: row.activated_at,
    can_operate: Boolean(row.can_operate),
  };
}

export async function getLicensesForCompanies(
  companyIds: string[]
): Promise<LicenseView[]> {
  const results: LicenseView[] = [];
  for (const id of companyIds) {
    const lic = await refreshAndGetLicense(id);
    if (lic) results.push(lic);
  }
  return results;
}

/** Aggregate: can operate if ANY selected company can operate (for ALL scope). */
export function canOperateAny(licenses: LicenseView[]): boolean {
  if (licenses.length === 0) return false;
  return licenses.some((l) => l.can_operate);
}

export function formatTrialRemaining(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export async function getSupportWhatsApp(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_app_settings")
    .select("value")
    .eq("key", "support_whatsapp")
    .is("company_id", null)
    .maybeSingle();
  return data?.value || "9825063208";
}

export function whatsappLink(number: string, message?: string): string {
  const digits = number.replace(/\D/g, "");
  const text = message
    ? `?text=${encodeURIComponent(message)}`
    : "";
  return `https://wa.me/${digits}${text}`;
}
