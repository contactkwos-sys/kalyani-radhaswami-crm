import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { appRoleFromLoginRole } from "@/lib/auth/role-login";

const PEPPER = "kwos-kalyani-radhaswami-2026";

/**
 * Next.js mirror of api/admin-create-user.js (service role — never client).
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: string;
      loginSlug?: string;
      displayName?: string;
      role?: string;
      tempPin?: string;
    };

    const expected = process.env.DEV_OVERRIDE_KEY;
    if (expected && body.key !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { loginSlug, displayName, role, tempPin } = body;
    if (!loginSlug || !displayName || !role || !tempPin) {
      return NextResponse.json(
        { error: "loginSlug, displayName, role, tempPin required" },
        { status: 400 }
      );
    }

    const password = `${tempPin}-${loginSlug}-${PEPPER}`;
    const admin = createServiceClient();

    const { data: authUser, error: authErr } =
      await admin.auth.admin.createUser({
        email: `${loginSlug}@internal.kwos.local`,
        password,
        email_confirm: true,
      });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { error: rowErr } = await admin.from("app_users").insert({
      id: authUser.user!.id,
      login_slug: loginSlug,
      display_name: displayName,
      role,
      pin_is_set: false,
    });
    if (rowErr) {
      return NextResponse.json({ error: rowErr.message }, { status: 400 });
    }

    await admin.from("crm_profiles").upsert({
      id: authUser.user!.id,
      email: `${loginSlug}@internal.kwos.local`,
      full_name: displayName,
      role: appRoleFromLoginRole(role),
      is_active: true,
      company_scope: "ALL",
    });

    return NextResponse.json({ ok: true, id: authUser.user!.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
