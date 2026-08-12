/**
 * Netlify Function: create Supabase auth user (service role)
 * Env: DEV_OVERRIDE_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL | SUPABASE_URL
 */
const { timingSafeEqual } = require("crypto");
const { createClient } = require("@supabase/supabase-js");

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
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
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "";
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !service) {
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "SUPABASE_SERVICE_ROLE_KEY / SUPABASE_URL not configured",
        }),
      };
    }

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim();
    const role = String(body.role || "ADMIN");
    if (!email || !password || !fullName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "email, password, fullName required" }),
      };
    }

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) {
      return { statusCode: 400, body: JSON.stringify({ error: error.message }) };
    }

    const userId = data.user?.id;
    if (userId) {
      await admin.from("crm_profiles").upsert({
        id: userId,
        email,
        full_name: fullName,
        role,
        is_active: true,
        company_scope: "ALL",
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, id: userId, email, role }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || "Server error" }),
    };
  }
};
