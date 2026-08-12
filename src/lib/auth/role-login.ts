import { ROLE_HOME, type LoginRole } from "@/lib/auth/pin-auth-shared";
import type { AppRole } from "@/types/database";

export type RoleHome =
  | "/admin"
  | "/ceo"
  | "/accountant"
  | "/salesman"
  | "/dashboard";

export { ROLE_HOME };
export type { LoginRole };

/** Map CRM AppRole → login role home (server-side). */
export function homeForRole(role: AppRole | string): RoleHome {
  switch (role) {
    case "OWNER":
    case "ADMIN":
    case "admin":
      return ROLE_HOME.admin;
    case "CEO_1":
    case "CEO_2":
    case "CEO_3":
    case "ceo":
      return ROLE_HOME.ceo;
    case "ACCOUNTANT":
    case "accountant":
      return ROLE_HOME.accountant;
    case "SALESMAN":
    case "SALES_MANAGER":
    case "salesman":
      return ROLE_HOME.salesman;
    default:
      return "/dashboard";
  }
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
