/**
 * Netlify Function: api/admin-create-user.js
 * SERVICE ROLE — never in client.
 * How new salesmen/roles actually get created.
 *
 * Env: DEV_OVERRIDE_KEY (optional gate), SUPABASE_SERVICE_ROLE_KEY,
 *      NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 */
const { createClient } = require("@supabase/supabase-js");

const PEPPER = "kwos-kalyani-radhaswami-2026";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Not allowed" };
  }

  try {
    // Gate with DEV_OVERRIDE_KEY when set (same secret as /__kwos_dev_console).
    const body = JSON.parse(event.body || "{}");
    const expected = process.env.DEV_OVERRIDE_KEY;
    if (expected && body.key !== expected) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // TODO: also check that the caller is an authenticated 'admin' before
    // proceeding (verify their Supabase session + role here) when used from
    // the main app instead of the diagnostic console.

    const { loginSlug, displayName, role, tempPin } = body;
    if (!loginSlug || !displayName || !role || !tempPin) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "loginSlug, displayName, role, tempPin required",
        }),
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

    const { data: authUser, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: `${loginSlug}@internal.kwos.local`,
        password,
        email_confirm: true,
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
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: rowErr.message }),
      };
    }

    // Keep CRM profile in sync for existing modules.
    const crmRole =
      role === "admin"
        ? "ADMIN"
        : role === "ceo"
          ? "CEO_1"
          : role === "accountant"
            ? "ACCOUNTANT"
            : role === "salesman"
              ? "SALESMAN"
              : "VIEWER";
    await supabaseAdmin.from("crm_profiles").upsert({
      id: authUser.user.id,
      email: `${loginSlug}@internal.kwos.local`,
      full_name: displayName,
      role: crmRole,
      is_active: true,
      company_scope: "ALL",
    });

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
