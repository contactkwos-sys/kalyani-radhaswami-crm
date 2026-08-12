import type { AppRole, Profile } from "@/types/database";
import { ROLE_PERMISSIONS } from "@/types/database";

const DEVELOPER_DISPLAY_NAME = "System Administration";
const DEVELOPER_ROLE_LABEL = "Administrator";

/** True for the protected internal developer identity. */
export function isDeveloperIdentity(
  profile: Pick<Profile, "is_developer" | "role"> | null | undefined
): boolean {
  return Boolean(profile?.is_developer && profile.role === "OWNER");
}

/**
 * Public-facing name. Never expose the personal developer name on normal UI.
 */
export function displayProfileName(
  profile: Pick<Profile, "full_name" | "is_developer" | "role">
): string {
  if (isDeveloperIdentity(profile)) return DEVELOPER_DISPLAY_NAME;
  return profile.full_name;
}

export function displayRoleLabel(
  profile: Pick<Profile, "role" | "is_developer">
): string {
  if (isDeveloperIdentity(profile)) return DEVELOPER_ROLE_LABEL;
  return ROLE_PERMISSIONS[profile.role as AppRole]?.label || profile.role;
}

/**
 * Whether a user row should appear in normal CEO/Owner User Management lists.
 * Developer identity is hidden unless the viewer is the developer.
 */
export function isVisibleInUserManagement(
  user: Pick<Profile, "is_developer" | "role" | "is_primary_owner">,
  viewerIsDeveloper: boolean
): boolean {
  if (viewerIsDeveloper) return true;
  if (isDeveloperIdentity(user)) return false;
  if (user.is_primary_owner && user.is_developer) return false;
  return true;
}

export const PUBLIC_BRANDING = {
  productLine: "Kalyani · Radhaswami Sales Force CRM",
  supportEmail: "contact.kwos@gmail.com",
  supportWhatsApp: "9825063208",
  supportWhatsAppDisplay: "98250-63-208",
} as const;
