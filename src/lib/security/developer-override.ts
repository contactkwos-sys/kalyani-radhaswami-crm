import { timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { getCurrentProfile, requireProfile } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/admin";
import { stripPinMetadata } from "@/lib/auth/pin";
import type { AppRole, Profile } from "@/types/database";

/** Operations the Owner/Developer may authorize through protected APIs. */
export const DEVELOPER_OPERATIONS = [
  "ADD_USER",
  "DELETE_USER",
  "DEACTIVATE_USER",
  "ENABLE_USER",
  "CHANGE_ROLE",
  "RESET_PIN",
  "CHANGE_PIN",
  "REVOKE_SESSIONS",
  "LOGOUT_ALL_DEVICES",
  "RESET_DEVICES",
  "CHANGE_PERMISSIONS",
  "RESTORE_USER",
  "VIEW_AUDIT_LOGS",
  "CHANGE_SECURITY_SETTINGS",
  "OVERRIDE_LOCKED_USER",
  "FORCE_PIN_RESET",
  "MANAGE_ROLE_PERMISSIONS",
  "MODIFY_PRIMARY_OWNER",
] as const;

export type DeveloperOperation = (typeof DEVELOPER_OPERATIONS)[number];

/** Destructive / high-risk ops that always require DEVELOPER_OVERRIDE_KEY. */
export const OVERRIDE_REQUIRED_OPS: ReadonlySet<DeveloperOperation> = new Set([
  "DELETE_USER",
  "CHANGE_ROLE",
  "CHANGE_SECURITY_SETTINGS",
  "MANAGE_ROLE_PERMISSIONS",
  "MODIFY_PRIMARY_OWNER",
  "FORCE_PIN_RESET",
]);

/** Ops that require override when the target is OWNER or ADMIN. */
export const OVERRIDE_IF_PRIVILEGED_TARGET: ReadonlySet<DeveloperOperation> =
  new Set([
    "RESET_PIN",
    "CHANGE_PIN",
    "DEACTIVATE_USER",
    "REVOKE_SESSIONS",
    "LOGOUT_ALL_DEVICES",
    "RESET_DEVICES",
    "OVERRIDE_LOCKED_USER",
  ]);

export type DeveloperProfile = Profile & {
  is_primary_owner: boolean;
  is_developer: boolean;
  deactivated_at?: string | null;
};

export type VerifyDeveloperOverrideResult =
  | {
      ok: true;
      actor: DeveloperProfile;
      operation: DeveloperOperation;
      overrideUsed: boolean;
    }
  | {
      ok: false;
      error: string;
      code:
        | "UNAUTHENTICATED"
        | "INACTIVE"
        | "NOT_OWNER_DEVELOPER"
        | "INVALID_OPERATION"
        | "OVERRIDE_REQUIRED"
        | "OVERRIDE_INVALID"
        | "OVERRIDE_NOT_CONFIGURED"
        | "CLIENT_FORBIDDEN";
    };

function getConfiguredOverrideKey(): string | null {
  const key = process.env.DEVELOPER_OVERRIDE_KEY;
  if (!key || key.length < 32) return null;
  // Reject accidental NEXT_PUBLIC exposure patterns
  if (key.startsWith("NEXT_PUBLIC_")) return null;
  return key;
}

/** Timing-safe compare; never logs either value. */
export function safeEqualSecret(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      // Still compare against self to keep timing flatter
      timingSafeEqual(a, a);
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isDeveloperOperation(op: string): op is DeveloperOperation {
  return (DEVELOPER_OPERATIONS as readonly string[]).includes(op);
}

export function operationRequiresOverride(op: DeveloperOperation): boolean {
  return OVERRIDE_REQUIRED_OPS.has(op);
}

export async function loadDeveloperProfile(
  userId?: string
): Promise<DeveloperProfile | null> {
  const base = userId
    ? null
    : ((await getCurrentProfile()) as DeveloperProfile | null);

  if (!userId && base) {
    // Refresh flags that may not be on older typed selects
    const admin = createServiceClient();
    const { data } = await admin
      .from("crm_profiles")
      .select(
        "id, email, full_name, mobile, photo_url, role, is_active, preferred_company_id, company_scope, created_at, updated_at, is_primary_owner, is_developer, deactivated_at"
      )
      .eq("id", base.id)
      .maybeSingle();
    return (data as DeveloperProfile) || null;
  }

  if (!userId) return null;
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_profiles")
    .select(
      "id, email, full_name, mobile, photo_url, role, is_active, preferred_company_id, company_scope, created_at, updated_at, is_primary_owner, is_developer, deactivated_at"
    )
    .eq("id", userId)
    .maybeSingle();
  return (data as DeveloperProfile) || null;
}

export async function writeDeveloperAudit(params: {
  actorId: string | null;
  action: string;
  targetUserId?: string | null;
  operation?: string;
  success: boolean;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const admin = createServiceClient();
  const metadata = stripPinMetadata({
    ...(params.metadata || {}),
    success: params.success,
    target_user: params.targetUserId || undefined,
    operation: params.operation || undefined,
  });
  // Never persist override key material
  delete metadata.DEVELOPER_OVERRIDE_KEY;
  delete metadata.developer_override_key;
  delete metadata.override_key;

  const { error } = await admin.from("crm_audit_logs").insert({
    user_id: params.actorId,
    action: params.action,
    module: "developer_override",
    record_type: "crm_profiles",
    record_id: params.targetUserId || params.actorId,
    metadata,
    ip_address: params.ipAddress || null,
    user_agent: params.userAgent || null,
  });
  if (error) {
    console.error("developer audit write failed:", error.message);
  }
}

export async function requestClientInfo(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ipAddress =
      (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
      h.get("x-real-ip") ||
      null;
    return { ipAddress, userAgent: h.get("user-agent") };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Server-only Developer Override gate.
 *
 * Verifies:
 * 1. authenticated user exists
 * 2. user has OWNER role + is_developer
 * 3. developer override secret is valid when required / provided
 * 4. request is server-side (this module must never be imported from client)
 * 5. requested operation is allowed
 *
 * Never returns the secret. Never impersonates another user.
 */
export async function verifyDeveloperOverride(params: {
  operation: string;
  overrideKey?: string | null;
  targetUserId?: string | null;
  /** When true, always require the override key even for non-destructive ops. */
  forceOverride?: boolean;
}): Promise<VerifyDeveloperOverrideResult> {
  const { ipAddress, userAgent } = await requestClientInfo();

  let actor: DeveloperProfile | null = null;
  try {
    const profile = await requireProfile();
    actor = await loadDeveloperProfile(profile.id);
  } catch {
    await writeDeveloperAudit({
      actorId: null,
      action: "DEVELOPER_OVERRIDE_DENIED",
      operation: params.operation,
      targetUserId: params.targetUserId,
      success: false,
      metadata: { reason: "UNAUTHENTICATED" },
      ipAddress,
      userAgent,
    });
    return { ok: false, error: "Authentication required.", code: "UNAUTHENTICATED" };
  }

  if (!actor || !actor.is_active) {
    await writeDeveloperAudit({
      actorId: actor?.id || null,
      action: "DEVELOPER_OVERRIDE_DENIED",
      operation: params.operation,
      targetUserId: params.targetUserId,
      success: false,
      metadata: { reason: "INACTIVE" },
      ipAddress,
      userAgent,
    });
    return { ok: false, error: "Account disabled.", code: "INACTIVE" };
  }

  if (actor.role !== "OWNER" || !actor.is_developer) {
    await writeDeveloperAudit({
      actorId: actor.id,
      action: "DEVELOPER_OVERRIDE_DENIED",
      operation: params.operation,
      targetUserId: params.targetUserId,
      success: false,
      metadata: { reason: "NOT_OWNER_DEVELOPER", role: actor.role },
      ipAddress,
      userAgent,
    });
    return {
      ok: false,
      error: "Owner/Developer privileges required.",
      code: "NOT_OWNER_DEVELOPER",
    };
  }

  if (!isDeveloperOperation(params.operation)) {
    await writeDeveloperAudit({
      actorId: actor.id,
      action: "DEVELOPER_OVERRIDE_DENIED",
      operation: params.operation,
      targetUserId: params.targetUserId,
      success: false,
      metadata: { reason: "INVALID_OPERATION" },
      ipAddress,
      userAgent,
    });
    return {
      ok: false,
      error: "Operation is not allowed.",
      code: "INVALID_OPERATION",
    };
  }

  const operation = params.operation;
  const needsOverride =
    params.forceOverride || operationRequiresOverride(operation);
  const provided = (params.overrideKey || "").trim();

  if (needsOverride) {
    const expected = getConfiguredOverrideKey();
    if (!expected) {
      await writeDeveloperAudit({
        actorId: actor.id,
        action: "DEVELOPER_OVERRIDE_DENIED",
        operation,
        targetUserId: params.targetUserId,
        success: false,
        metadata: { reason: "OVERRIDE_NOT_CONFIGURED" },
        ipAddress,
        userAgent,
      });
      return {
        ok: false,
        error: "Developer Override is not configured on the server.",
        code: "OVERRIDE_NOT_CONFIGURED",
      };
    }
    if (!provided) {
      await writeDeveloperAudit({
        actorId: actor.id,
        action: "DEVELOPER_OVERRIDE_DENIED",
        operation,
        targetUserId: params.targetUserId,
        success: false,
        metadata: { reason: "OVERRIDE_REQUIRED" },
        ipAddress,
        userAgent,
      });
      return {
        ok: false,
        error: "Developer Override confirmation is required for this action.",
        code: "OVERRIDE_REQUIRED",
      };
    }
    if (!safeEqualSecret(provided, expected)) {
      await writeDeveloperAudit({
        actorId: actor.id,
        action: "DEVELOPER_OVERRIDE_FAILED",
        operation,
        targetUserId: params.targetUserId,
        success: false,
        metadata: { reason: "OVERRIDE_INVALID" },
        ipAddress,
        userAgent,
      });
      return {
        ok: false,
        error: "Invalid Developer Override confirmation.",
        code: "OVERRIDE_INVALID",
      };
    }
  } else if (provided) {
    // Optional confirmation for non-required ops: still validate if provided
    const expected = getConfiguredOverrideKey();
    if (!expected || !safeEqualSecret(provided, expected)) {
      await writeDeveloperAudit({
        actorId: actor.id,
        action: "DEVELOPER_OVERRIDE_FAILED",
        operation,
        targetUserId: params.targetUserId,
        success: false,
        metadata: { reason: "OVERRIDE_INVALID_OPTIONAL" },
        ipAddress,
        userAgent,
      });
      return {
        ok: false,
        error: "Invalid Developer Override confirmation.",
        code: "OVERRIDE_INVALID",
      };
    }
  }

  await writeDeveloperAudit({
    actorId: actor.id,
    action: "DEVELOPER_OVERRIDE_GRANTED",
    operation,
    targetUserId: params.targetUserId,
    success: true,
    metadata: {
      override_used: needsOverride || Boolean(provided),
    },
    ipAddress,
    userAgent,
  });

  return {
    ok: true,
    actor,
    operation,
    overrideUsed: needsOverride || Boolean(provided),
  };
}

/** Owner (any) or Owner/Developer for routine user management without override. */
export async function requireOwnerOrAdminManager(): Promise<Profile> {
  const profile = await requireProfile();
  if (!["OWNER","CEO_1","CEO_2","CEO_3","ADMIN"].includes(profile.role)) {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

export function isPrimaryOwnerProtected(
  target: { is_primary_owner?: boolean; role?: AppRole } | null
): boolean {
  return Boolean(target?.is_primary_owner);
}

export function assertCanModifyPrimaryOwner(params: {
  actor: DeveloperProfile;
  target: { id: string; is_primary_owner?: boolean };
  operation: DeveloperOperation;
  overrideVerified: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (!params.target.is_primary_owner) return { ok: true };
  if (params.operation === "MODIFY_PRIMARY_OWNER" && params.overrideVerified) {
    return { ok: true };
  }
  if (params.target.id === params.actor.id && params.operation === "CHANGE_PIN") {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "Primary Owner account is protected. Use the Owner recovery procedure with Developer Override.",
  };
}

export function isOverrideConfigured(): boolean {
  return Boolean(getConfiguredOverrideKey());
}
