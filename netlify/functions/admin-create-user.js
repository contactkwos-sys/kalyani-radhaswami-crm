/**
 * Netlify function: api/admin-create-user.js
 * Protected by DEV_OVERRIDE_KEY (timing-safe). Server-side pepper only.
 */
const { createClient } = require("@supabase/supabase-js");
const { timingSafeEqual, randomInt, createHash } = require("crypto");
const bcrypt = require("bcryptjs");

function getPepper() {
  return (
    process.env.AUTH_PIN_PEPPER ||
    process.env.TILE_AUTH_PEPPER ||
    "kwos-kalyani-radhaswami-2026"
  );
}

function deriveAuthPassword(loginSlug, pin) {
  return `${pin}-${loginSlug}-${getPepper()}`;
}

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a || ""), "utf8");
    const bb = Buffer.from(String(b || ""), "utf8");
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab);
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function generateTempPin() {
  let pin = "";
  for (let i = 0; i < 6; i += 1) pin += String(randomInt(0, 10));
  return pin;
}

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
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY || "";
    if (!key || !expected || !safeEqual(key, expected)) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    let { loginSlug, displayName, role, tempPin } = body;
    loginSlug = String(loginSlug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    role = String(role || "").trim().toLowerCase();
    displayName = String(displayName || "").trim();
    if (role === "ceo") {
      if (
        displayName.toLowerCase().includes("kailash") ||
        displayName.startsWith("CEO (")
      ) {
        displayName = "CEO";
      }
      displayName = displayName || "CEO";
    }
    if (!loginSlug || !displayName || !role) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid fields" }),
      };
    }
    if (!/^\d{4,8}$/.test(tempPin || "")) tempPin = generateTempPin();

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

    const password = deriveAuthPassword(loginSlug, tempPin);
    const crmRoleByLogin = {
      admin: "ADMIN",
      ceo: "CEO_1",
      accountant: "ACCOUNTANT",
      salesman: "SALESMAN",
      other: "VIEWER",
    };
    const crmRole = crmRoleByLogin[role] || "VIEWER";
    const subtitles = {
      admin: "System administrator",
      ceo: "Chief Executive / Management",
      accountant: "Accounts & entries",
      salesman: "Field sales",
      other: "Authorized user",
    };

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

    const id = authUser.user.id;
    const { error: rowErr } = await supabaseAdmin.from("app_users").insert({
      id,
      login_slug: loginSlug,
      display_name: displayName,
      role,
      role_subtitle: subtitles[role] || null,
      pin_is_set: false,
      is_active: true,
    });
    if (rowErr) {
      await supabaseAdmin.auth.admin.deleteUser(id);
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: rowErr.message }),
      };
    }

    await supabaseAdmin.from("crm_profiles").upsert(
      {
        id,
        email: `${loginSlug}@internal.kwos.local`,
        full_name: displayName,
        role: crmRole,
        is_active: true,
        is_developer: false,
      },
      { onConflict: "id" }
    );

    const pin_hash = await bcrypt.hash(tempPin, 12);
    const placeholderMobile = `9${createHash("sha256")
      .update(id)
      .digest("hex")
      .slice(0, 9)}`.slice(0, 10);
    await supabaseAdmin.from("crm_user_login").upsert({
      user_id: id,
      mobile_number: placeholderMobile,
      pin_hash,
      must_change_pin: false,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id, temporaryPin: tempPin }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message || "Server error" }),
    };
  }
};
