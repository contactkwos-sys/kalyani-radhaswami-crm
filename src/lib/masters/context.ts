import {
  getAccessibleCompanies,
  getCurrentProfile,
} from "@/lib/auth/session";
import type { Company, Profile } from "@/types/database";

export async function getActiveCompanyContext(): Promise<{
  profile: Profile;
  companies: Company[];
  selectedCompanyIds: string[];
}> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("UNAUTHORIZED");
  const companies = await getAccessibleCompanies(profile.id, profile.role);

  let selectedCompanyIds = companies.map((c) => c.id);
  if (profile.company_scope !== "ALL" && profile.preferred_company_id) {
    selectedCompanyIds = companies
      .filter((c) => c.id === profile.preferred_company_id)
      .map((c) => c.id);
  } else if (profile.company_scope !== "ALL") {
    selectedCompanyIds = companies
      .filter((c) => c.code === profile.company_scope)
      .map((c) => c.id);
  }

  return { profile, companies, selectedCompanyIds };
}
