import type { AppRole } from "@/types/database";

/** Higher rank = more privilege. Developer is OWNER + is_developer flag. */
export const ROLE_RANK: Record<AppRole, number> = {
  OWNER: 100,
  CEO_1: 90,
  CEO_2: 80,
  CEO_3: 70,
  CEO_4: 65,
  ADMIN: 60,
  SALES_MANAGER: 40,
  ACCOUNTANT: 30,
  SALESMAN: 20,
  VIEWER: 10,
};

export const CEO_ROLES: AppRole[] = ["CEO_1", "CEO_2", "CEO_3", "CEO_4"];

export const EXECUTIVE_ROLES: AppRole[] = [
  "OWNER",
  "CEO_1",
  "CEO_2",
  "CEO_3",
  "CEO_4",
  "ADMIN",
];

export const MANAGEMENT_ROLES: AppRole[] = [
  ...EXECUTIVE_ROLES,
  "SALES_MANAGER",
];

export function isCeoRole(role: AppRole | string): boolean {
  return CEO_ROLES.includes(role as AppRole);
}

export function isExecutiveRole(role: AppRole | string): boolean {
  return EXECUTIVE_ROLES.includes(role as AppRole);
}

export function isManagementRole(role: AppRole | string): boolean {
  return MANAGEMENT_ROLES.includes(role as AppRole);
}

export function roleRank(role: AppRole | string): number {
  return ROLE_RANK[role as AppRole] ?? 0;
}

/** Can actor manage target based on role hierarchy (server-side). */
export function canManageTargetRole(
  actorRole: AppRole,
  targetRole: AppRole,
  opts?: { actorIsDeveloper?: boolean; sameUser?: boolean }
): boolean {
  if (opts?.sameUser) return true;
  if (opts?.actorIsDeveloper && actorRole === "OWNER") return true;
  if (!isExecutiveRole(actorRole)) return false;
  if (actorRole === "OWNER") return true;
  return roleRank(actorRole) > roleRank(targetRole);
}

export function canResetOtherUserPin(
  actorRole: AppRole,
  targetRole: AppRole,
  opts?: { actorIsDeveloper?: boolean }
): boolean {
  if (!isExecutiveRole(actorRole)) return false;
  return canManageTargetRole(actorRole, targetRole, opts);
}
