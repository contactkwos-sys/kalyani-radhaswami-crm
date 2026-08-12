#!/usr/bin/env node
/**
 * Apply / rotate Developer (primary Owner) mobile login PIN from server env.
 * Never hardcodes the PIN in source. Usage:
 *   DEVELOPER_LOGIN_PIN=**** OWNER_MOBILE=9825063208 node scripts/bootstrap-developer-pin.js
 *
 * Sets must_change_pin=true so the developer must rotate after first login.
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://pelwnhukierrqienpveb.supabase.co";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

async function main() {
  const pin =
    process.env.DEVELOPER_LOGIN_PIN ||
    process.env.CRM_DEVELOPER_LOGIN_PIN ||
    process.env.OWNER_LOGIN_PIN ||
    "";
  const mobileRaw =
    process.env.OWNER_MOBILE ||
    process.env.CRM_OWNER_MOBILE ||
    process.env.DEVELOPER_MOBILE ||
    "";
  const mobile = String(mobileRaw).replace(/\D/g, "").slice(-10);

  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  if (!/^[0-9]{4,8}$/.test(pin)) {
    throw new Error(
      "Set DEVELOPER_LOGIN_PIN (4–8 digits) in the environment — never commit it."
    );
  }
  if (mobile.length !== 10) {
    throw new Error("Set OWNER_MOBILE / DEVELOPER_MOBILE to a 10-digit number");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error } = await admin
    .from("crm_profiles")
    .select("id, full_name, email, is_primary_owner, is_developer, role")
    .eq("is_primary_owner", true)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error("Primary Owner profile not found");

  const pin_hash = await bcrypt.hash(pin, 12);
  const { error: upsertErr } = await admin.from("crm_user_login").upsert({
    user_id: profile.id,
    mobile_number: mobile,
    pin_hash,
    pin_updated_at: new Date().toISOString(),
    failed_attempts: 0,
    locked_until: null,
    must_change_pin: true,
  });
  if (upsertErr) throw upsertErr;

  await admin
    .from("crm_profiles")
    .update({
      mobile,
      is_developer: true,
      role: "OWNER",
      is_active: true,
    })
    .eq("id", profile.id);

  // Revoke remembered devices after PIN bootstrap
  await admin
    .from("crm_auth_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .is("revoked_at", null);

  await admin.from("crm_audit_logs").insert({
    user_id: profile.id,
    action: "DEVELOPER_PIN_BOOTSTRAP",
    module: "auth",
    record_type: "crm_user_login",
    record_id: profile.id,
    metadata: {
      success: true,
      must_change_pin: true,
      mobile_suffix: mobile.slice(-4),
    },
  });

  console.log(
    "Developer mobile+PIN bootstrap complete for",
    profile.full_name,
    `(···${mobile.slice(-4)}). must_change_pin=true`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
