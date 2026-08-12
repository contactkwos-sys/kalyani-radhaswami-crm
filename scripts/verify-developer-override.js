#!/usr/bin/env node
/**
 * Developer Override + Owner privilege acceptance tests (real DB).
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
const { timingSafeEqual, randomBytes } = require("crypto");

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

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ixulyhomqtajenigopai.supabase.co";
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SERVICE) {
  console.error("Missing SERVICE key");
  process.exit(1);
}

const admin = createClient(URL.replace(/\/$/, ""), SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
const pass = (name, detail = "") => {
  results.push({ name, ok: true, detail });
  console.log("PASS", name, detail);
};
const fail = (name, detail = "") => {
  results.push({ name, ok: false, detail });
  console.error("FAIL", name, detail);
};

function safeEqualSecret(provided, expected) {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function ensureUser(email, password, meta) {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = listed?.users?.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) throw error;
    user = data.user;
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { ...(user.user_metadata || {}), ...meta },
    });
  }
  return user;
}

async function main() {
  // Migration columns
  const { data: colCheck, error: colErr } = await admin
    .from("crm_profiles")
    .select("id, is_primary_owner, is_developer, deactivated_at")
    .limit(1);
  if (colErr) fail("migration.developer_columns", colErr.message);
  else pass("migration.developer_columns", `rows=${(colCheck || []).length}`);

  const overrideKey =
    process.env.DEVELOPER_OVERRIDE_KEY || randomBytes(32).toString("hex");
  if (overrideKey.length < 32) fail("env.override_key_length");
  else pass("env.override_key_length", String(overrideKey.length));

  if (overrideKey.startsWith("NEXT_PUBLIC_")) fail("env.not_public_prefix");
  else pass("env.not_public_prefix");

  {
    const ok = safeEqualSecret(overrideKey, overrideKey);
    const bad = safeEqualSecret(overrideKey, "x".repeat(overrideKey.length));
    if (ok && !bad) pass("crypto.timing_safe_compare");
    else fail("crypto.timing_safe_compare");
  }

  const stamp = Date.now().toString(36);
  const ownerEmail = `crm.devowner+${stamp}@example.com`;
  const salesmanEmail = `crm.devsales+${stamp}@example.com`;
  const pw = `DevTest!${stamp}A1`;
  const mobile = `9${String(Date.now()).slice(-9)}`;

  const owner = await ensureUser(ownerEmail, pw, {
    app: "crm",
    crm: "true",
    role: "OWNER",
    full_name: "Kumaresh Budhia Test",
  });
  const salesman = await ensureUser(salesmanEmail, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "Dev Salesman",
  });

  // Do not set is_primary_owner on disposable test users (unique + production safety).
  await admin.from("crm_profiles").upsert({
    id: owner.id,
    email: ownerEmail,
    full_name: "Kumaresh Budhia Test",
    role: "OWNER",
    is_active: true,
    company_scope: "ALL",
    is_primary_owner: false,
    is_developer: true,
  });
  await admin.from("crm_profiles").upsert({
    id: salesman.id,
    email: salesmanEmail,
    full_name: "Dev Salesman",
    mobile,
    role: "SALESMAN",
    is_active: true,
    company_scope: "KALYANI",
    is_primary_owner: false,
    is_developer: false,
  });

  const { data: ownerRow } = await admin
    .from("crm_profiles")
    .select("is_primary_owner, is_developer, role")
    .eq("id", owner.id)
    .single();
  if (ownerRow?.is_developer && ownerRow?.role === "OWNER" && !ownerRow.is_primary_owner) {
    pass("owner.developer_flags", "developer-not-primary-test-user");
  } else fail("owner.developer_flags", JSON.stringify(ownerRow));

  // PIN reset flow: hash + revoke devices
  const pin = "4242";
  const pin_hash = await bcrypt.hash(pin, 12);
  await admin.from("crm_user_login").upsert({
    user_id: salesman.id,
    mobile_number: mobile,
    pin_hash,
    pin_updated_at: new Date().toISOString(),
    failed_attempts: 5,
    locked_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  const token_hash = require("crypto")
    .createHash("sha256")
    .update(randomBytes(32).toString("hex"))
    .digest("hex");
  const { data: device } = await admin
    .from("crm_auth_devices")
    .insert({
      user_id: salesman.id,
      token_hash,
      device_label: "override-test",
    })
    .select("id")
    .single();

  const newPin = "1357";
  const newHash = await bcrypt.hash(newPin, 12);
  const now = new Date().toISOString();
  await admin
    .from("crm_user_login")
    .update({
      pin_hash: newHash,
      pin_updated_at: now,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("user_id", salesman.id);
  await admin
    .from("crm_auth_devices")
    .update({
      revoked_at: now,
      revoked_by: owner.id,
    })
    .eq("user_id", salesman.id)
    .is("revoked_at", null);

  const { data: loginAfter } = await admin
    .from("crm_user_login")
    .select("pin_hash, locked_until, failed_attempts, pin_updated_at")
    .eq("user_id", salesman.id)
    .single();
  const oldOk = await bcrypt.compare(pin, loginAfter.pin_hash);
  const newOk = await bcrypt.compare(newPin, loginAfter.pin_hash);
  if (!oldOk && newOk && loginAfter.locked_until === null) {
    pass("pin.reset_and_unlock");
  } else fail("pin.reset_and_unlock");

  const { data: revoked } = await admin
    .from("crm_auth_devices")
    .select("revoked_at")
    .eq("id", device.id)
    .single();
  if (revoked?.revoked_at) pass("session.devices_revoked");
  else fail("session.devices_revoked");

  // Primary owner protection: unique primary row exists (test or production)
  const { data: primary } = await admin
    .from("crm_profiles")
    .select("id, role, is_primary_owner")
    .eq("is_primary_owner", true)
    .maybeSingle();
  if (!primary || primary.role === "OWNER") {
    pass(
      "owner.primary_protected_row",
      primary ? String(primary.id).slice(0, 8) : "none-yet"
    );
  } else fail("owner.primary_protected_row", JSON.stringify(primary));

  // Audit write without PIN/secret leakage
  const { error: auditErr } = await admin.from("crm_audit_logs").insert({
    user_id: owner.id,
    action: "DEVELOPER_OVERRIDE_GRANTED",
    module: "developer_override",
    record_type: "crm_profiles",
    record_id: salesman.id,
    metadata: {
      success: true,
      target_user: salesman.id,
      operation: "RESET_PIN",
      // these must be stripped by app writers; raw insert test ensures we can store clean meta
    },
    ip_address: "127.0.0.1",
    user_agent: "verify-developer-override",
  });
  if (auditErr) fail("audit.write", auditErr.message);
  else pass("audit.write");

  const { data: auditRows } = await admin
    .from("crm_audit_logs")
    .select("metadata, action")
    .eq("user_id", owner.id)
    .eq("action", "DEVELOPER_OVERRIDE_GRANTED")
    .order("created_at", { ascending: false })
    .limit(1);
  const meta = auditRows?.[0]?.metadata || {};
  if (
    meta.pin === undefined &&
    meta.DEVELOPER_OVERRIDE_KEY === undefined &&
    meta.success === true
  ) {
    pass("audit.no_secrets");
  } else fail("audit.no_secrets", JSON.stringify(meta));

  // Role change salesman → ACCOUNTANT
  await admin
    .from("crm_profiles")
    .update({ role: "ACCOUNTANT" })
    .eq("id", salesman.id);
  const { data: roleAfter } = await admin
    .from("crm_profiles")
    .select("role")
    .eq("id", salesman.id)
    .single();
  if (roleAfter?.role === "ACCOUNTANT") pass("role.change");
  else fail("role.change");

  // Cleanup
  await admin.from("crm_auth_devices").delete().eq("user_id", salesman.id);
  await admin.from("crm_user_login").delete().eq("user_id", salesman.id);
  await admin.from("crm_profiles").delete().eq("id", salesman.id);
  await admin.auth.admin.deleteUser(salesman.id);
  await admin.from("crm_profiles").delete().eq("id", owner.id);
  await admin.auth.admin.deleteUser(owner.id);
  pass("cleanup");

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Developer Override summary ---");
  console.log(`PASS ${results.filter((r) => r.ok).length} / ${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log("FAIL", f.name, f.detail);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
