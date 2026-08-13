import { ROLE_HOME, type LoginRole } from "@/lib/auth/pin-auth-shared";
import type { AppRole } from "@/types/database";

export type RoleHome = "/dashboard";

export { ROLE_HOME };
export type { LoginRole };

/** Map CRM AppRole → login role home (server-side). Always the real dashboard. */
export function homeForRole(role: AppRole | string): RoleHome {
  void role;
  return "/dashboard";
}

export function appRoleFromLoginRole(role: LoginRole | string): AppRole {
  switch (role) {
    case "admin":
      return "ADMIN";
    case "ceo":
      return "CEO_1";
    case "accountant":
      return "ACCOUNTANT";
    case "salesman":
      return "SALESMAN";
    default:
      return "VIEWER";
  }
}
