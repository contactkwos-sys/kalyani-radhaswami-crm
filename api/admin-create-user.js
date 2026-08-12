/**
 * Netlify Function: create Supabase auth user for role-tile PIN login
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 *
 * Body: { key, loginSlug, displayName, role, tempPin }
 * Creates auth user email = {loginSlug}@internal.kwos.local
 * password = {tempPin}-{loginSlug}-{PEPPER}
 */
const { timingSafeEqual } = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PEPPER = "kwos-kalyani-radhaswami-2026";

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function deriveAuthPassword(loginSlug, pin) {
  return `${pin}-${loginSlug}-${PEPPER}`;
}

function slugEmail(loginSlug) {
  return `${loginSlug}@internal.kwos.local`;
}

function crmRole(loginRole) {
  switch (loginRole) {
    case "admin":
      return "ADMIN";
    case "ceo":
      return "CEO_1";
    case "accountant":
      return "ACCOUNTANT";
    case "salesman":
      return "SALESMAN";
    default:
      return "VIEWER";
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const expected = process.env.DEV_OVERRIDE_KEY || "";
    if (!expected || !safeEqual(body.key, expected)) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid key" }) };
    }

    const url =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !service) {
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL not configured",
        }),
      };
    }

    const loginSlug = String(body.loginSlug || "")
      .trim()
      .toLowerCase();
    const displayName = String(body.displayName || body.fullName || "").trim();
    const role = String(body.role || "admin").toLowerCase();
    const tempPin = String(body.tempPin || body.password || "").replace(/\D/g, "");
    const sortOrder = Number(body.sortOrder || 100);

    if (!loginSlug || !displayName || !/^\d{4}$/.test(tempPin)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "loginSlug, displayName, and 4-digit tempPin required",
        }),
      };
    }
    if (!["admin", "ceo", "accountant", "salesman"].includes(role)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid role" }),
      };
    }

    const email = slugEmail(loginSlug);
    const password = deriveAuthPassword(loginSlug, tempPin);
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, login_slug: loginSlug, role },
    });
    if (error) {
      return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
    }

    const userId = data.user?.id;
    if (userId) {
      await admin.from("crm_profiles").upsert({
        id: userId,
        email,
        full_name: displayName,
        role: crmRole(role),
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        id: userId,
        email,
        loginSlug,
        role,
        tempPinShownOnce: tempPin,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || "Server error" }),
    };
  }
};
