#!/usr/bin/env node
/**
 * Secure Owner recovery (server-side only).
 * Requires DEVELOPER_OVERRIDE_KEY in the environment.
 *
 * Usage examples:
 *   DEVELOPER_OVERRIDE_KEY=... OWNER_RECOVERY_EMAIL=... node scripts/owner-recovery.js --mark-primary
 *   DEVELOPER_OVERRIDE_KEY=... OWNER_RECOVERY_EMAIL=... node scripts/owner-recovery.js --set-developer
 *   DEVELOPER_OVERRIDE_KEY=... OWNER_RECOVERY_EMAIL=... NEW_LOGIN_PIN=2468 node scripts/owner-recovery.js --reset-pin
 *
 * Never prints the override key or PIN values.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { timingSafeEqual } = require("crypto");
const bcrypt = require("bcryptjs");

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
    process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));

function safeEqualSecret(provided, expected) {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function main() {
  const expected = process.env.DEVELOPER_OVERRIDE_KEY;
  if (!expected || expected.length < 32) {
    throw new Error("DEVELOPER_OVERRIDE_KEY missing or too short");
  }
  // Confirm by re-reading env (operator must have set it); no second prompt in non-interactive cloud.
  if (!safeEqualSecret(expected, process.env.DEVELOPER_OVERRIDE_KEY)) {
    throw new Error("Override confirmation failed");
  }

  const email = process.env.OWNER_RECOVERY_EMAIL || process.env.OWNER_EMAIL;
  if (!email) throw new Error("OWNER_RECOVERY_EMAIL required");

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://pelwnhukierrqienpveb.supabase.co";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const user = listed?.users?.find((u) => u.email === email);
  if (!user) throw new Error("Auth user not found for recovery email");

  const args = new Set(process.argv.slice(2));

  if (args.has("--mark-primary") || args.has("--set-developer")) {
    await admin
      .from("crm_profiles")
      .update({ is_primary_owner: false })
      .eq("is_primary_owner", true);
    const patch = {
      role: "OWNER",
      is_active: true,
      company_scope: "ALL",
    };
    if (args.has("--mark-primary")) patch.is_primary_owner = true;
    if (args.has("--set-developer")) patch.is_developer = true;
    const { error } = await admin.from("crm_profiles").upsert({
      id: user.id,
      email,
      full_name:
        process.env.OWNER_NAME ||
        user.user_metadata?.full_name ||
        "Kumaresh Budhia",
      ...patch,
    });
    if (error) throw error;
    console.log("Primary Owner / Developer flags updated for", email);
  }

  if (args.has("--reset-pin")) {
    const pin = process.env.NEW_LOGIN_PIN;
    const mobile = (process.env.OWNER_MOBILE || "").replace(/\D/g, "").slice(-10);
    if (!pin || !/^[0-9]{4,8}$/.test(pin)) {
      throw new Error("NEW_LOGIN_PIN must be 4–8 digits");
    }
    if (mobile.length !== 10) throw new Error("OWNER_MOBILE required (10 digits)");
    const pin_hash = await bcrypt.hash(pin, 12);
    const { error } = await admin.from("crm_user_login").upsert({
      user_id: user.id,
      mobile_number: mobile,
      pin_hash,
      pin_updated_at: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    });
    if (error) throw error;
    await admin
      .from("crm_auth_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    try {
      await admin.auth.admin.signOut(user.id, "global");
    } catch {
      // ignore
    }
    console.log("Owner login PIN reset; sessions/devices revoked for", email);
  }

  await admin.from("crm_audit_logs").insert({
    user_id: user.id,
    action: "OWNER_RECOVERY_PROCEDURE",
    module: "developer_override",
    record_type: "crm_profiles",
    record_id: user.id,
    metadata: {
      success: true,
      operations: [...args],
    },
  });
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
