import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import {
  adminSetUserActive,
  adminSetUserMobile,
  adminSetUserPin,
  listDevicesForUser,
  revokeAllDevicesAndSessions,
  revokeDevice,
} from "@/lib/auth/mobile-login";
import { ROLE_PERMISSIONS } from "@/types/database";
import { createServiceClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const profile = await requireProfile();
  if (!ROLE_PERMISSIONS[profile.role].canManageUsers) {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const admin = createServiceClient();
    const { data: user } = await admin
      .from("crm_profiles")
      .select("id, email, full_name, mobile, role, is_active")
      .eq("id", id)
      .maybeSingle();
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { data: login } = await admin
      .from("crm_user_login")
      .select("mobile_number, last_login_at, pin_updated_at, locked_until")
      .eq("user_id", id)
      .maybeSingle();
    const devices = await listDevicesForUser(id);
    return NextResponse.json({
      user: {
        ...user,
        mobile_number: login?.mobile_number || user.mobile,
        last_login_at: login?.last_login_at || null,
        pin_updated_at: login?.pin_updated_at || null,
        locked_until: login?.locked_until || null,
        has_pin: Boolean(login),
      },
      devices,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json(
      { error: msg === "FORBIDDEN" ? "Forbidden" : "Unauthorized" },
      { status: msg === "FORBIDDEN" ? 403 : 401 }
    );
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const adminProfile = await requireAdmin();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      action?: string;
      mobile?: string;
      newPin?: string;
      isActive?: boolean;
      deviceId?: string;
    };

    switch (body.action) {
      case "set_mobile": {
        const result = await adminSetUserMobile({
          adminId: adminProfile.id,
          userId: id,
          mobile: String(body.mobile || ""),
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ ok: true });
      }
      case "set_pin":
      case "reset_pin": {
        const result = await adminSetUserPin({
          adminId: adminProfile.id,
          userId: id,
          newPin: String(body.newPin || ""),
          mobile: body.mobile ? String(body.mobile) : undefined,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          message: "PIN set. User must sign in again.",
        });
      }
      case "set_active": {
        await adminSetUserActive({
          adminId: adminProfile.id,
          userId: id,
          isActive: Boolean(body.isActive),
        });
        return NextResponse.json({ ok: true });
      }
      case "revoke_all": {
        await revokeAllDevicesAndSessions(
          id,
          adminProfile.id,
          "ADMIN_REVOKE_ALL"
        );
        return NextResponse.json({ ok: true });
      }
      case "revoke_device": {
        if (!body.deviceId) {
          return NextResponse.json({ error: "deviceId required" }, { status: 400 });
        }
        await revokeDevice({
          adminId: adminProfile.id,
          deviceId: body.deviceId,
        });
        return NextResponse.json({ ok: true });
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
