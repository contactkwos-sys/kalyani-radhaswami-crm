import type { AppRole, Profile } from "@/types/database";
import { isDeveloperIdentity } from "@/lib/auth/display";
import { isCeoRole, isExecutiveRole } from "@/lib/auth/roles";

/** Fine-grained permission keys enforced server-side. */
export const PERMISSIONS = [
  "dashboard.view",
  "sales.create",
  "sales.edit",
  "sales.delete",
  "sales.view",
  "customer.view",
  "customer.create",
  "customer.edit",
  "product.view",
  "product.create",
  "product.edit",
  "image.upload",
  "accounting.view",
  "reports.view",
  "users.create",
  "users.edit",
  "users.disable",
  "users.view",
  "pin.reset",
  "settings.manage",
  "invite.create",
  "invite.revoke",
  "audit.view",
  "backup.manage",
  "security.manage",
  "developer.override",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_BUSINESS: Permission[] = PERMISSIONS.filter(
  (p) => p !== "developer.override" && p !== "security.manage"
);

const CEO_PERMS: Permission[] = [
  "dashboard.view",
  "sales.create",
  "sales.edit",
  "sales.delete",
  "sales.view",
  "customer.view",
  "customer.create",
  "customer.edit",
  "product.view",
  "product.create",
  "product.edit",
  "image.upload",
  "accounting.view",
  "reports.view",
  "users.create",
  "users.edit",
  "users.disable",
  "users.view",
  "pin.reset",
  "settings.manage",
  "invite.create",
  "invite.revoke",
  "audit.view",
  "backup.manage",
];

const ADMIN_PERMS: Permission[] = CEO_PERMS.filter(
  (p) => p !== "developer.override"
);

const ACCOUNTANT_PERMS: Permission[] = [
  "dashboard.view",
  "sales.create",
  "sales.edit",
  "sales.view",
  "customer.view",
  "customer.create",
  "customer.edit",
  "product.view",
  "product.create",
  "product.edit",
  "image.upload",
  "accounting.view",
  "reports.view",
];

const SALESMAN_PERMS: Permission[] = [
  "dashboard.view",
  "sales.create",
  "sales.view",
  "customer.view",
  "product.view",
  "image.upload",
  "reports.view",
];

const OTHER_PERMS: Permission[] = [
  "dashboard.view",
  "reports.view",
  "customer.view",
  "sales.view",
];

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<AppRole, Permission[]> = {
  OWNER: [...ALL_BUSINESS, "security.manage"],
  CEO_1: [...CEO_PERMS],
  CEO_2: [...CEO_PERMS],
  CEO_3: [...CEO_PERMS],
  CEO_4: [...CEO_PERMS],
  ADMIN: [...ADMIN_PERMS],
  SALES_MANAGER: [
    "dashboard.view",
    "sales.view",
    "sales.create",
    "sales.edit",
    "customer.view",
    "customer.create",
    "customer.edit",
    "product.view",
    "reports.view",
    "users.view",
  ],
  SALESMAN: [...SALESMAN_PERMS],
  ACCOUNTANT: [...ACCOUNTANT_PERMS],
  VIEWER: [...OTHER_PERMS],
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function sanitizePermissions(input: unknown): Permission[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;
  const out: Permission[] = [];
  for (const item of input) {
    if (typeof item === "string" && isPermission(item) && !out.includes(item)) {
      // Never grant developer.override via DB JSON — env-gated only.
      if (item === "developer.override") continue;
      out.push(item);
    }
  }
  return out;
}

export function defaultPermissionsForRole(role: AppRole): Permission[] {
  return [...(DEFAULT_PERMISSIONS_BY_ROLE[role] || OTHER_PERMS)];
}

type PermProfile = Pick<
  Profile,
  "role" | "is_developer" | "is_active" | "allowed_modules"
> & {
  allowed_permissions?: string[] | null;
};

export function resolvePermissions(profile: PermProfile): Permission[] {
  if (isDeveloperIdentity(profile)) {
    return [...PERMISSIONS];
  }
  const custom = sanitizePermissions(profile.allowed_permissions);
  if (custom && custom.length > 0) return custom;
  return defaultPermissionsForRole(profile.role as AppRole);
}

export function hasPermission(
  profile: PermProfile,
  permission: Permission
): boolean {
  if (profile.is_active === false) return false;
  // Admin/CEO/etc. never receive developer.override from role defaults.
  if (permission === "developer.override") {
    return isDeveloperIdentity(profile);
  }
  return resolvePermissions(profile).includes(permission);
}

export function assertPermission(
  profile: PermProfile,
  permission: Permission
): void {
  if (!profile.is_active) throw new Error("ACCOUNT_DISABLED");
  if (!hasPermission(profile, permission)) throw new Error("FORBIDDEN");
}

export function canResetPins(profile: PermProfile): boolean {
  return hasPermission(profile, "pin.reset") && isExecutiveRole(profile.role);
}

export function canManageInvites(profile: PermProfile): boolean {
  return (
    hasPermission(profile, "invite.create") ||
    hasPermission(profile, "invite.revoke")
  );
}

export function loginRoleFromAppRole(role: AppRole | string): string {
  if (role === "ADMIN") return "admin";
  if (isCeoRole(role) || role === "OWNER") return "ceo";
  if (role === "ACCOUNTANT") return "accountant";
  if (role === "SALESMAN" || role === "SALES_MANAGER") return "salesman";
  return "other";
}

export function publicTileLabelForRole(role: AppRole | string): string {
  if (role === "ADMIN") return "Admin";
  if (role === "CEO_1") return "CEO";
  if (role === "CEO_2") return "CEO 2";
  if (role === "CEO_3") return "CEO 3";
  if (role === "CEO_4") return "CEO 4";
  if (role === "OWNER") return "CEO";
  if (role === "ACCOUNTANT") return "Accountant";
  if (role === "SALESMAN") return "Salesman";
  if (role === "SALES_MANAGER") return "Sales Manager";
  if (role === "VIEWER") return "Authorized User";
  return "Authorized User";
}
