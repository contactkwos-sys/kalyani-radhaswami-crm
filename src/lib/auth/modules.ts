import type { AppRole, Profile } from "@/types/database";
import { isExecutiveRole } from "@/lib/auth/roles";

/** CRM module keys used for nav + server-side authorization. */
export const CRM_MODULES = [
  "dashboard",
  "today",
  "followups",
  "sales",
  "parties",
  "products",
  "salesmen",
  "visits",
  "incentives",
  "reports",
  "accounts",
  "assignments",
  "alerts",
  "intervention",
  "targets",
  "users",
  "audit",
  "backup",
  "security",
  "settings",
  "license",
  "company",
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];

export const MODULE_LABELS: Record<CrmModule, string> = {
  dashboard: "Dashboard",
  today: "Today",
  followups: "Follow-up",
  sales: "Sales",
  parties: "Parties / Customers",
  products: "Products",
  salesmen: "Salesmen",
  visits: "Visits",
  incentives: "Incentives",
  reports: "Reports",
  accounts: "Accounts",
  assignments: "Assignments",
  alerts: "Alerts",
  intervention: "Intervention",
  targets: "Targets",
  users: "User Management",
  audit: "Audit Logs",
  backup: "Backup",
  security: "Security Settings",
  settings: "Settings",
  license: "License",
  company: "Company",
};

const ALL_MODULES = [...CRM_MODULES];

const EXEC_MODULES: CrmModule[] = [
  "dashboard",
  "today",
  "followups",
  "sales",
  "parties",
  "products",
  "salesmen",
  "visits",
  "incentives",
  "reports",
  "accounts",
  "assignments",
  "alerts",
  "intervention",
  "targets",
  "users",
  "audit",
  "backup",
  "settings",
  "license",
  "company",
];

export const DEFAULT_MODULES_BY_ROLE: Record<AppRole, CrmModule[]> = {
  OWNER: [...EXEC_MODULES, "security"],
  CEO_1: [...EXEC_MODULES],
  CEO_2: [...EXEC_MODULES],
  CEO_3: [...EXEC_MODULES],
  CEO_4: [...EXEC_MODULES],
  ADMIN: [...EXEC_MODULES],
  SALES_MANAGER: [
    "dashboard",
    "today",
    "followups",
    "sales",
    "parties",
    "products",
    "salesmen",
    "visits",
    "incentives",
    "reports",
    "assignments",
    "settings",
    "company",
  ],
  SALESMAN: [
    "dashboard",
    "today",
    "followups",
    "sales",
    "parties",
    "visits",
    "incentives",
    "reports",
    "company",
  ],
  ACCOUNTANT: [
    "dashboard",
    "sales",
    "parties",
    "accounts",
    "reports",
    "incentives",
    "settings",
    "company",
  ],
  VIEWER: [
    "dashboard",
    "reports",
    "parties",
    "sales",
    "company",
  ],
};

/** Map nav/route prefixes to module keys. */
export const ROUTE_MODULE: Array<{ prefix: string; module: CrmModule }> = [
  { prefix: "/settings/users", module: "users" },
  { prefix: "/settings/audit-logs", module: "audit" },
  { prefix: "/settings/backup", module: "backup" },
  { prefix: "/settings/security", module: "security" },
  { prefix: "/settings/targets", module: "targets" },
  { prefix: "/settings/incentives", module: "incentives" },
  { prefix: "/settings/intelligence", module: "settings" },
  { prefix: "/settings/license", module: "license" },
  { prefix: "/settings/company", module: "company" },
  { prefix: "/settings/account", module: "settings" },
  { prefix: "/reports", module: "reports" },
  { prefix: "/alerts", module: "alerts" },
  { prefix: "/intervention", module: "intervention" },
  { prefix: "/assignments", module: "assignments" },
  { prefix: "/salesmen", module: "salesmen" },
  { prefix: "/products", module: "products" },
  { prefix: "/parties", module: "parties" },
  { prefix: "/sales", module: "sales" },
  { prefix: "/incentives", module: "incentives" },
  { prefix: "/follow-ups", module: "followups" },
  { prefix: "/today", module: "today" },
  { prefix: "/dashboard", module: "dashboard" },
];

export function isCrmModule(value: string): value is CrmModule {
  return (CRM_MODULES as readonly string[]).includes(value);
}

export function sanitizeModules(input: unknown): CrmModule[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const out: CrmModule[] = [];
  for (const item of input) {
    if (typeof item === "string" && isCrmModule(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function defaultModulesForRole(role: AppRole): CrmModule[] {
  if (role === "OWNER") return [...ALL_MODULES];
  return [...(DEFAULT_MODULES_BY_ROLE[role] || ["dashboard"])];
}

export function resolveAllowedModules(
  profile: Pick<Profile, "role" | "allowed_modules" | "is_developer">
): CrmModule[] {
  if (profile.is_developer && profile.role === "OWNER") {
    return [...ALL_MODULES];
  }
  const custom = sanitizeModules(profile.allowed_modules);
  if (custom && custom.length > 0) return custom;
  return defaultModulesForRole(profile.role);
}

export function hasModuleAccess(
  profile: Pick<Profile, "role" | "allowed_modules" | "is_developer">,
  module: CrmModule
): boolean {
  return resolveAllowedModules(profile).includes(module);
}

export function moduleForPath(pathname: string): CrmModule | null {
  for (const row of ROUTE_MODULE) {
    if (pathname === row.prefix || pathname.startsWith(`${row.prefix}/`)) {
      return row.module;
    }
  }
  return null;
}

/** Server-side gate for protected APIs. */
export function assertModuleAccess(
  profile: Pick<Profile, "role" | "allowed_modules" | "is_developer" | "is_active">,
  module: CrmModule
): void {
  if (!profile.is_active) throw new Error("ACCOUNT_DISABLED");
  if (!hasModuleAccess(profile, module)) throw new Error("FORBIDDEN");
}

export function canManageUsersModule(
  profile: Pick<Profile, "role" | "allowed_modules" | "is_developer">
): boolean {
  return (
    isExecutiveRole(profile.role) && hasModuleAccess(profile, "users")
  );
}
