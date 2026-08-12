/**
 * ============================================================================
 * 10_admin_create_user.js
 * Netlify function: api/admin-create-user.js
 * Creates the Supabase Auth user AND the app_users row IN ONE CALL — this
 * is what makes the setup wizard possible with zero UUID copy-paste.
 * Protected by DEV_OVERRIDE_KEY so only the setup wizard (or you) can call it.
 * ============================================================================
 *
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 * Auth: header `x-dev-key` must equal DEV_OVERRIDE_KEY.
 */
const { createClient } = require("@supabase/supabase-js");

const PEPPER = "kwos-kalyani-radhaswami-2026"; // must match the one in auth lib

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Not allowed" };
  }

  try {
    const headers = event.headers || {};
    const key =
      headers["x-dev-key"] ||
      headers["X-Dev-Key"] ||
      headers["X-DEV-KEY"] ||
      "";
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY;
    if (!key || !expected || key !== expected) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const { loginSlug, displayName, role, tempPin } = JSON.parse(
      event.body || "{}"
    );
    if (!loginSlug || !displayName || !role || !/^\d{4}$/.test(tempPin || "")) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid fields" }),
      };
    }

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !service) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }),
      };
    }

    const supabaseAdmin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const password = `${tempPin}-${loginSlug}-${PEPPER}`;
    const crmRoleByLogin = {
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
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: authErr.message }),
      };
    }

    const { error: rowErr } = await supabaseAdmin.from("app_users").insert({
      id: authUser.user.id,
      login_slug: loginSlug,
      display_name: displayName,
      role,
      pin_is_set: false,
    });
    if (rowErr) {
      // roll back the auth user so a retry doesn't collide
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: rowErr.message }),
      };
    }

    await supabaseAdmin.from("crm_profiles").upsert(
      {
        id: authUser.user.id,
        email: `${loginSlug}@internal.kwos.local`,
        full_name: displayName,
        role: crmRole,
        is_active: true,
      },
      { onConflict: "id" }
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id: authUser.user.id }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message || "Server error" }),
    };
  }
};
