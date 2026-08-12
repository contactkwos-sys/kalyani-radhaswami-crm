import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  deriveAuthPassword,
  slugEmail,
} from "@/lib/auth/pin-auth-shared";
import { appRoleFromLoginRole } from "@/lib/auth/role-login";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

/**
 * Next.js mirror of api/admin-create-user.js
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      loginSlug?: string;
      displayName?: string;
      fullName?: string;
      role?: string;
      tempPin?: string;
      password?: string;
      sortOrder?: number;
    };
    const expected = process.env.DEV_OVERRIDE_KEY || "";
    if (!expected || !safeEqual(String(body.key || ""), expected)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 401 });
    }

    const loginSlug = String(body.loginSlug || "")
      .trim()
      .toLowerCase();
    const displayName = String(body.displayName || body.fullName || "").trim();
    const role = String(body.role || "admin").toLowerCase();
    const tempPin = String(body.tempPin || body.password || "").replace(
      /\D/g,
      ""
    );
    const sortOrder = Number(body.sortOrder || 100);

    if (!loginSlug || !displayName || !/^\d{4}$/.test(tempPin)) {
      return NextResponse.json(
        { error: "loginSlug, displayName, and 4-digit tempPin required" },
        { status: 400 }
      );
    }
    if (!["admin", "ceo", "accountant", "salesman"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const email = slugEmail(loginSlug);
    const password = deriveAuthPassword(loginSlug, tempPin);
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, login_slug: loginSlug, role },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userId = data.user?.id;
    if (userId) {
      await admin.from("crm_profiles").upsert({
        id: userId,
        email,
        full_name: displayName,
        role: appRoleFromLoginRole(role as "admin"),
        is_active: true,
        company_scope: "ALL",
      });
      await admin.from("app_users").upsert({
        id: userId,
        login_slug: loginSlug,
        display_name: displayName,
        role,
        pin_is_set: false,
        is_active: true,
        sort_order: sortOrder,
      });
    }

    return NextResponse.json({
      ok: true,
      id: userId,
      email,
      loginSlug,
      role,
      tempPinShownOnce: tempPin,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
