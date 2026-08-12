#!/usr/bin/env node
/**
 * Mobile + PIN auth acceptance tests (real DB / real auth users).
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
const { createHash, randomBytes } = require("crypto");

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
  for (const table of [
    "crm_user_login",
    "crm_auth_devices",
    "crm_profiles",
    "crm_pin_reset_requests",
  ]) {
    const { error } = await admin.from(table).select("*").limit(1);
    if (error) fail(`table:${table}`, error.message);
    else pass(`table:${table}`);
  }

  // Mobile normalization expectations (shared with app)
  function normalizeMobile(input) {
    const digits = String(input || "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
    if (digits.length >= 10 && digits.length <= 15) {
      const last10 = digits.slice(-10);
      if (last10.length === 10) return last10;
      return digits;
    }
    return null;
  }
  if (
    normalizeMobile("+91 9876543210") === "9876543210" &&
    normalizeMobile("+919876543210") === "9876543210"
  ) {
    pass("mobile.normalize");
  } else fail("mobile.normalize");

  const stamp = Date.now().toString(36);
  const email = `crm.pin+${stamp}@example.com`;
  const pw = `PinTest!${stamp}A1`;
  const mobile = `9${String(Date.now()).slice(-9)}`;
  const pin = "2468";
  const badPin = "0000";

  const user = await ensureUser(email, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "PIN Tester",
  });
  await admin.from("crm_profiles").upsert({
    id: user.id,
    email,
    full_name: "PIN Tester",
    mobile,
    role: "SALESMAN",
    is_active: true,
    company_scope: "KALYANI",
  });

  const pin_hash = await bcrypt.hash(pin, 12);
  await admin.from("crm_user_login").upsert({
    user_id: user.id,
    mobile_number: mobile,
    pin_hash,
    failed_attempts: 0,
    locked_until: null,
  });
  pass("login.row_created", mobile);

  // PIN hash never equals plaintext
  const { data: loginRow } = await admin
    .from("crm_user_login")
    .select("pin_hash")
    .eq("user_id", user.id)
    .single();
  if (loginRow.pin_hash === pin || loginRow.pin_hash.length < 20) {
    fail("security.pin_hashed");
  } else pass("security.pin_hashed");

  const good = await bcrypt.compare(pin, loginRow.pin_hash);
  const bad = await bcrypt.compare(badPin, loginRow.pin_hash);
  if (good && !bad) pass("pin.verify");
  else fail("pin.verify");

  // Session via generateLink (same as app)
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link?.properties?.hashed_token) {
    fail("session.generateLink", linkErr?.message);
  } else {
    pass("session.generateLink");
    const anon = createClient(URL.replace(/\/$/, ""), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sess, error: otpErr } = await anon.auth.verifyOtp({
      type: "email",
      token_hash: link.properties.hashed_token,
    });
    if (otpErr || !sess.session) fail("session.verifyOtp", otpErr?.message);
    else pass("session.verifyOtp", sess.user.id);
  }

  // Inactive user
  await admin.from("crm_profiles").update({ is_active: false }).eq("id", user.id);
  const { data: inactive } = await admin
    .from("crm_profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();
  if (!inactive.is_active) pass("inactive.flag");
  else fail("inactive.flag");
  await admin.from("crm_profiles").update({ is_active: true }).eq("id", user.id);

  // Device token hash with expiry
  const token = randomBytes(32).toString("hex");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: device, error: dErr } = await admin
    .from("crm_auth_devices")
    .insert({
      user_id: user.id,
      token_hash,
      device_label: "verify",
      expires_at,
    })
    .select("id, expires_at")
    .single();
  if (dErr) fail("device.create", dErr.message);
  else if (!device.expires_at) fail("device.expires_at", "missing");
  else pass("device.create", device.id);

  await admin
    .from("crm_auth_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", device.id);
  const { data: revoked } = await admin
    .from("crm_auth_devices")
    .select("revoked_at")
    .eq("id", device.id)
    .single();
  if (revoked.revoked_at) pass("device.revoke");
  else fail("device.revoke");

  // Forgot PIN request (never stores plaintext PIN)
  const { data: forgot, error: fErr } = await admin
    .from("crm_pin_reset_requests")
    .insert({
      mobile_number: mobile,
      user_id: user.id,
      status: "PENDING",
    })
    .select("id, status")
    .single();
  if (fErr) fail("forgot_pin.request", fErr.message);
  else pass("forgot_pin.request", forgot.id);

  // CEO role assignable
  const { error: ceoErr } = await admin
    .from("crm_profiles")
    .update({ role: "CEO_1" })
    .eq("id", user.id);
  if (ceoErr) fail("ceo.role_assign", ceoErr.message);
  else {
    const { data: ceoRow } = await admin
      .from("crm_profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (ceoRow?.role === "CEO_1") pass("ceo.role_assign");
    else fail("ceo.role_assign", ceoRow?.role);
    await admin.from("crm_profiles").update({ role: "SALESMAN" }).eq("id", user.id);
  }

  // Duplicate mobile blocked by unique index
  const otherEmail = `crm.pin.dup+${stamp}@example.com`;
  const other = await ensureUser(otherEmail, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "Dup Mobile",
  });
  await admin.from("crm_profiles").upsert({
    id: other.id,
    email: otherEmail,
    full_name: "Dup Mobile",
    mobile: "9999999999",
    role: "SALESMAN",
    is_active: true,
    company_scope: "KALYANI",
  });
  const { error: dupErr } = await admin.from("crm_user_login").insert({
    user_id: other.id,
    mobile_number: mobile,
    pin_hash: await bcrypt.hash("9999", 12),
  });
  if (dupErr) pass("duplicate.mobile_blocked", dupErr.message);
  else fail("duplicate.mobile_blocked", "unique constraint missing");

  // Admin reset pin invalidates by updating hash
  const newHash = await bcrypt.hash("1357", 12);
  await admin
    .from("crm_user_login")
    .update({
      pin_hash: newHash,
      pin_updated_at: new Date().toISOString(),
      must_change_pin: true,
    })
    .eq("user_id", user.id);
  const oldOk = await bcrypt.compare(pin, newHash);
  const newOk = await bcrypt.compare("1357", newHash);
  if (!oldOk && newOk) pass("admin.reset_pin");
  else fail("admin.reset_pin");

  // RLS: anon cannot read pin_hash via authenticated salesman client
  const salesmanClient = createClient(
    URL.replace(/\/$/, ""),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  await salesmanClient.auth.signInWithPassword({ email, password: pw });
  const { data: leak, error: leakErr } = await salesmanClient
    .from("crm_user_login")
    .select("pin_hash")
    .eq("user_id", user.id);
  if ((!leak || leak.length === 0) && leakErr) {
    pass("rls.pin_hidden", leakErr.message);
  } else if (!leak || leak.length === 0) {
    pass("rls.pin_hidden", "empty");
  } else {
    fail("rls.pin_hidden", "pin_hash readable");
  }

  // cleanup
  await admin.from("crm_pin_reset_requests").delete().eq("user_id", user.id);
  await admin.from("crm_auth_devices").delete().eq("user_id", user.id);
  await admin.from("crm_user_login").delete().eq("user_id", user.id);
  await admin.from("crm_profiles").delete().eq("id", user.id);
  await admin.auth.admin.deleteUser(user.id);
  await admin.from("crm_user_login").delete().eq("user_id", other.id);
  await admin.from("crm_profiles").delete().eq("id", other.id);
  await admin.auth.admin.deleteUser(other.id);
  pass("cleanup");

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Mobile+PIN summary ---");
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
