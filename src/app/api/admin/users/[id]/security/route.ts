import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import {
  adminSetUserMobile,
  listDevicesForUser,
  revokeAllDevicesAndSessions,
  revokeDevice,
} from "@/lib/auth/mobile-login";
import { ROLE_PERMISSIONS } from "@/types/database";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  isOverrideConfigured,
  loadDeveloperProfile,
  operationRequiresOverride,
  OVERRIDE_IF_PRIVILEGED_TARGET,
  verifyDeveloperOverride,
  type DeveloperOperation,
} from "@/lib/security/developer-override";
import {
  changeUserRole,
  deleteUserAccount,
  isManageableRole,
  ownerResetUserPin,
  setUserActiveState,
  unlockUserAccount,
} from "@/lib/security/user-admin";

async function requireManager() {
  const profile = await requireProfile();
  if (!ROLE_PERMISSIONS[profile.role].canManageUsers) {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

function mapOp(action: string): DeveloperOperation | null {
  switch (action) {
    case "set_pin":
    case "reset_pin":
    case "generate_pin":
      return "RESET_PIN";
    case "force_pin_reset":
    case "force_generate_pin":
      return "FORCE_PIN_RESET";
    case "set_active":
      return "DEACTIVATE_USER"; // refined below
    case "enable_user":
      return "ENABLE_USER";
    case "deactivate_user":
      return "DEACTIVATE_USER";
    case "restore_user":
      return "RESTORE_USER";
    case "revoke_all":
      return "LOGOUT_ALL_DEVICES";
    case "reset_devices":
      return "RESET_DEVICES";
    case "revoke_device":
      return "REVOKE_SESSIONS";
    case "change_role":
      return "CHANGE_ROLE";
    case "delete_user":
      return "DELETE_USER";
    case "unlock":
      return "OVERRIDE_LOCKED_USER";
    case "set_mobile":
      return null; // routine admin — no override required
    default:
      return null;
  }
}

async function targetIsPrivileged(userId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_profiles")
    .select("role, is_primary_owner")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return false;
  return (
    data.role === "OWNER" ||
    data.role === "ADMIN" ||
    Boolean(data.is_primary_owner)
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireManager();
    const { id } = await ctx.params;
    const admin = createServiceClient();
    const { data: user } = await admin
      .from("crm_profiles")
      .select(
        "id, email, full_name, mobile, role, is_active, is_primary_owner, is_developer, deactivated_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: login } = await admin
      .from("crm_user_login")
      .select("mobile_number, last_login_at, pin_updated_at, locked_until, failed_attempts")
      .eq("user_id", id)
      .maybeSingle();
    const devices = await listDevicesForUser(id);
    const actor = await loadDeveloperProfile();
    return NextResponse.json({
      user: {
        ...user,
        mobile_number: login?.mobile_number || user.mobile,
        last_login_at: login?.last_login_at || null,
        pin_updated_at: login?.pin_updated_at || null,
        locked_until: login?.locked_until || null,
        failed_attempts: login?.failed_attempts || 0,
        has_pin: Boolean(login),
      },
      devices,
      security: {
        overrideConfigured: isOverrideConfigured(),
        actorIsDeveloper: Boolean(actor?.is_developer && actor.role === "OWNER"),
        isPrimaryOwner: Boolean(user.is_primary_owner),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json(
      { error: msg === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: msg === "FORBIDDEN" ? 403 : 401 }
    );
  }
}

const bodySchema = z.object({
  action: z.string().min(1),
  mobile: z.string().optional(),
  newPin: z.string().optional(),
  autoGenerate: z.boolean().optional(),
  isActive: z.boolean().optional(),
  deviceId: z.string().uuid().optional(),
  role: z.string().optional(),
  hardDelete: z.boolean().optional(),
  confirm: z.boolean().optional(),
  developerOverrideKey: z.string().optional(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const manager = await requireManager();
    const { id } = await ctx.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const body = parsed.data;
    const op = mapOp(body.action);

    let operation: DeveloperOperation | null = op;
    if (body.action === "set_active") {
      operation = body.isActive ? "ENABLE_USER" : "DEACTIVATE_USER";
    }

    const privilegedTarget = await targetIsPrivileged(id);
    const needsDevGate = Boolean(
      (operation && operationRequiresOverride(operation)) ||
        (operation &&
          OVERRIDE_IF_PRIVILEGED_TARGET.has(operation) &&
          privilegedTarget) ||
        body.action === "force_pin_reset" ||
        body.action === "force_generate_pin" ||
        body.action === "delete_user" ||
        body.action === "change_role"
    );

    let developerActor = await loadDeveloperProfile(manager.id);

    if (needsDevGate) {
      if (!operation) {
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      }
      const verified = await verifyDeveloperOverride({
        operation,
        overrideKey: body.developerOverrideKey,
        targetUserId: id,
        forceOverride: true,
      });
      if (!verified.ok) {
        const status =
          verified.code === "OVERRIDE_REQUIRED" ||
          verified.code === "OVERRIDE_INVALID" ||
          verified.code === "OVERRIDE_NOT_CONFIGURED"
            ? 403
            : verified.code === "UNAUTHENTICATED"
              ? 401
              : 403;
        return NextResponse.json(
          { error: verified.error, code: verified.code },
          { status }
        );
      }
      developerActor = verified.actor;
    }

    switch (body.action) {
      case "set_mobile": {
        const result = await adminSetUserMobile({
          adminId: manager.id,
          userId: id,
          mobile: String(body.mobile || ""),
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "set_pin":
      case "reset_pin":
      case "force_pin_reset":
      case "generate_pin":
      case "force_generate_pin": {
        const autoGenerate =
          body.autoGenerate === true ||
          body.action === "generate_pin" ||
          body.action === "force_generate_pin";
        // Force pin reset for ADMIN/OWNER targets requires override (already gated when force_*)
        if (
          (body.action === "force_pin_reset" ||
            body.action === "force_generate_pin") &&
          !developerActor?.is_developer
        ) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const result = await ownerResetUserPin({
          actor: developerActor || manager,
          userId: id,
          newPin: autoGenerate ? undefined : String(body.newPin || ""),
          autoGenerate,
          mobile: body.mobile,
          operation:
            body.action === "force_pin_reset" ||
            body.action === "force_generate_pin"
              ? "FORCE_PIN_RESET"
              : "RESET_PIN",
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          message: result.temporaryPin
            ? "Temporary PIN generated. Copy it now — it will not be shown again. Remembered devices and sessions were revoked."
            : "PIN updated. Remembered devices and sessions revoked. User must sign in again.",
          temporaryPin: result.temporaryPin,
          pinAutoGenerated: result.pinAutoGenerated === true,
        });
      }
      case "set_active":
      case "enable_user":
      case "deactivate_user":
      case "restore_user": {
        const isActive =
          body.action === "enable_user" ||
          body.action === "restore_user" ||
          (body.action === "set_active" && Boolean(body.isActive));
        const result = await setUserActiveState({
          actor: developerActor || manager,
          userId: id,
          isActive,
          overrideVerified: needsDevGate,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "revoke_all":
      case "reset_devices": {
        if (!body.confirm) {
          return NextResponse.json(
            { error: "Confirmation required.", code: "CONFIRM_REQUIRED" },
            { status: 400 }
          );
        }
        await revokeAllDevicesAndSessions(
          id,
          (developerActor || manager).id,
          body.action === "reset_devices"
            ? "RESET_DEVICES"
            : "ADMIN_REVOKE_ALL"
        );
        return NextResponse.json({ ok: true });
      }
      case "revoke_device": {
        if (!body.deviceId) {
          return NextResponse.json(
            { error: "deviceId required" },
            { status: 400 }
          );
        }
        await revokeDevice({
          adminId: manager.id,
          deviceId: body.deviceId,
        });
        return NextResponse.json({ ok: true });
      }
      case "change_role": {
        if (!developerActor) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!body.role || !isManageableRole(body.role)) {
          return NextResponse.json({ error: "Invalid role." }, { status: 400 });
        }
        if (!body.confirm) {
          return NextResponse.json(
            { error: "Confirmation required.", code: "CONFIRM_REQUIRED" },
            { status: 400 }
          );
        }
        const result = await changeUserRole({
          actor: developerActor,
          userId: id,
          newRole: body.role,
          overrideVerified: true,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "delete_user": {
        if (!developerActor) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (!body.confirm) {
          return NextResponse.json(
            { error: "Confirmation required.", code: "CONFIRM_REQUIRED" },
            { status: 400 }
          );
        }
        const result = await deleteUserAccount({
          actor: developerActor,
          userId: id,
          hardDelete: Boolean(body.hardDelete),
          overrideVerified: true,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "unlock": {
        const result = await unlockUserAccount({
          actor: developerActor || manager,
          userId: id,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true, message: "Account unlocked." });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json(
      { error: msg === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: msg === "FORBIDDEN" ? 403 : 401 }
    );
  }
}
