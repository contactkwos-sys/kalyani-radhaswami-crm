import { NextResponse } from "next/server";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/admin";
import { deriveAuthPassword, slugEmail } from "@/lib/auth/pin-auth-server";
import { roleSubtitleForLoginRole } from "@/lib/auth/pin-auth-shared";

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab);
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function generateTempPin(): string {
  let pin = "";
  for (let i = 0; i < 6; i += 1) pin += String(randomInt(0, 10));
  return pin;
}

/**
 * Bootstrap helper for hidden /__kwos_setup.
 * Protected by DEV_OVERRIDE_KEY / DEVELOPER_OVERRIDE_KEY (timing-safe).
 */
export async function POST(request: Request) {
  try {
    const key = request.headers.get("x-dev-key") || "";
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY || "";
    if (!key || !expected || !safeEqual(key, expected)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      loginSlug?: string;
      displayName?: string;
      role?: string;
      tempPin?: string;
      fullName?: string;
    };

    const loginSlug = String(body.loginSlug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const role = String(body.role || "").trim().toLowerCase();
    let displayName = String(body.displayName || "").trim();
    const fullName = String(body.fullName || displayName || "").trim();

    if (!loginSlug || !role) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 }
      );
    }

    // Public CEO tile must never show a personal name.
    if (role === "ceo") {
      displayName = displayName.toLowerCase().includes("kailash")
        ? "CEO"
        : displayName.startsWith("CEO (")
          ? "CEO"
          : displayName || "CEO";
    }
    if (!displayName) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 }
      );
    }

    const tempPin =
      body.tempPin && /^\d{4,8}$/.test(body.tempPin)
        ? body.tempPin
        : generateTempPin();

    const password = deriveAuthPassword(loginSlug, tempPin);
    const supabaseAdmin = createServiceClient();

    const crmRoleByLogin: Record<string, string> = {
      admin: "ADMIN",
      ceo: "CEO_1",
      accountant: "ACCOUNTANT",
      salesman: "SALESMAN",
      other: "VIEWER",
    };
    const crmRole = crmRoleByLogin[role] || "VIEWER";

    const { data: authUser, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: slugEmail(loginSlug),
        password,
        email_confirm: true,
        user_metadata: {
          app: "crm",
          crm: "true",
          role: crmRole,
          full_name: fullName || displayName,
        },
      });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const userId = authUser.user!.id;
    const { error: rowErr } = await supabaseAdmin.from("app_users").insert({
      id: userId,
      login_slug: loginSlug,
      display_name: displayName,
      role,
      role_subtitle: roleSubtitleForLoginRole(role),
      pin_is_set: false,
      is_active: true,
      sort_order: role === "admin" ? 10 : role === "ceo" ? 20 : 40,
    });
    if (rowErr) {
      // Retry without role_subtitle for pre-migration DBs.
      const { error: retryErr } = await supabaseAdmin.from("app_users").insert({
        id: userId,
        login_slug: loginSlug,
        display_name: displayName,
        role: role === "other" ? "salesman" : role,
        pin_is_set: false,
        is_active: true,
      });
      if (retryErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: retryErr.message }, { status: 400 });
      }
    }

    await supabaseAdmin.from("crm_profiles").upsert(
      {
        id: userId,
        email: slugEmail(loginSlug),
        full_name: fullName || displayName,
        role: crmRole,
        is_active: true,
        is_developer: false,
        is_primary_owner: false,
        company_scope:
          crmRole === "ADMIN" ||
          crmRole === "CEO_1" ||
          crmRole === "ACCOUNTANT"
            ? "ALL"
            : "KALYANI",
      },
      { onConflict: "id" }
    );

    // bcrypt PIN row so mobile + remember-device paths work too (no mobile until Admin sets one).
    const bcrypt = await import("bcryptjs");
    const pin_hash = await bcrypt.hash(tempPin, 12);
    // Placeholder mobile unique per user (Admin should replace with real number).
    const placeholderMobile = `9${createHash("sha256")
      .update(userId)
      .digest("hex")
      .slice(0, 9)}`.slice(0, 10);
    await supabaseAdmin.from("crm_user_login").upsert({
      user_id: userId,
      mobile_number: placeholderMobile,
      pin_hash,
      must_change_pin: false,
      failed_attempts: 0,
      locked_until: null,
      pin_updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from("crm_audit_logs").insert({
      user_id: null,
      action: "BOOTSTRAP_USER_CREATED",
      module: "developer_override",
      record_type: "app_users",
      record_id: userId,
      metadata: { login_slug: loginSlug, role: crmRole },
    });

    return NextResponse.json({
      ok: true,
      id: userId,
      temporaryPin: tempPin,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
