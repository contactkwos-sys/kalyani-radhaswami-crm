import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

const PEPPER = "kwos-kalyani-radhaswami-2026"; // must match the one in auth lib

/**
 * Next.js mirror of api/admin-create-user.js (10_admin_create_user.js).
 * Creates auth.users + app_users in one call. Rolls back auth user on insert fail.
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 * Auth: header `x-dev-key` must equal DEV_OVERRIDE_KEY.
 */
export async function POST(request: Request) {
  try {
    const key = request.headers.get("x-dev-key");
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY;
    if (!key || !expected || key !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { loginSlug, displayName, role, tempPin } = (await request.json()) as {
      loginSlug?: string;
      displayName?: string;
      role?: string;
      tempPin?: string;
    };

    if (!loginSlug || !displayName || !role || !/^\d{4}$/.test(tempPin || "")) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 }
      );
    }

    const password = `${tempPin}-${loginSlug}-${PEPPER}`;
    const supabaseAdmin = createServiceClient();

    const crmRoleByLogin: Record<string, string> = {
      admin: "ADMIN",
      ceo: "CEO_1",
      accountant: "ACCOUNTANT",
      salesman: "SALESMAN",
    };
    const crmRole = crmRoleByLogin[role] || "VIEWER";

    const { data: authUser, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: `${loginSlug}@internal.kwos.local`,
        password,
        email_confirm: true,
        user_metadata: {
          app: "crm",
          crm: "true",
          role: crmRole,
          full_name: displayName,
        },
      });
    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { error: rowErr } = await supabaseAdmin.from("app_users").insert({
      id: authUser.user!.id,
      login_slug: loginSlug,
      display_name: displayName,
      role,
      pin_is_set: false,
    });
    if (rowErr) {
      // roll back the auth user so a retry doesn't collide
      await supabaseAdmin.auth.admin.deleteUser(authUser.user!.id);
      return NextResponse.json({ error: rowErr.message }, { status: 400 });
    }

    // Ensure CRM profile exists even if auth trigger already ran / skipped
    await supabaseAdmin.from("crm_profiles").upsert(
      {
        id: authUser.user!.id,
        email: `${loginSlug}@internal.kwos.local`,
        full_name: displayName,
        role: crmRole,
        is_active: true,
      },
      { onConflict: "id" }
    );

    return NextResponse.json({ ok: true, id: authUser.user!.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server error" },
      { status: 500 }
    );
  }
}
