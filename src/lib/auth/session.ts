import { createClient } from "@/lib/supabase/server";
import type { Company, Profile, UserCompanyAccess } from "@/types/database";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("crm_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getCurrentProfile error:", error.message);
    return null;
  }
  return data as Profile | null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    throw new Error("UNAUTHORIZED");
  }
  if (!profile.is_active) {
    throw new Error("ACCOUNT_DISABLED");
  }
  return profile;
}

export async function getAccessibleCompanies(
  userId: string,
  role: Profile["role"]
): Promise<Company[]> {
  const supabase = await createClient();

  if (role === "OWNER") {
    const { data, error } = await supabase
      .from("crm_companies")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data || []) as Company[];
  }

  const { data: access, error: accessError } = await supabase
    .from("crm_user_company_access")
    .select("company_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (accessError) throw accessError;
  const ids = (access || []).map((a: { company_id: string }) => a.company_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("crm_companies")
    .select("*")
    .in("id", ids)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data || []) as Company[];
}

export async function getUserCompanyAccess(
  userId: string
): Promise<UserCompanyAccess[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_user_company_access")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (error) throw error;
  return (data || []) as UserCompanyAccess[];
}

export function canAccessCompanyScope(
  profile: Profile,
  companyId: string | null,
  accessibleIds: string[]
): boolean {
  if (profile.role === "OWNER" && profile.company_scope === "ALL") return true;
  if (!companyId) return profile.role === "OWNER";
  return accessibleIds.includes(companyId);
}
