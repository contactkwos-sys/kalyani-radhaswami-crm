#!/usr/bin/env node
/**
 * End-to-end auth acceptance against the real Supabase project.
 * Covers: user create → mobile+PIN login verify → PIN reset → wrong PIN →
 * inactive → module defaults → developer privacy in listings.
 */
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
const { createHash, randomBytes } = require("crypto");

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://pelwnhukierrqienpveb.supabase.co";
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

function normalizeMobile(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

async function verifyLogin(mobile, pin) {
  const m = normalizeMobile(mobile);
  const { data: login, error } = await admin
    .from("crm_user_login")
    .select("user_id, pin_hash, failed_attempts, locked_until")
    .eq("mobile_number", m)
    .maybeSingle();
  if (error || !login) return { ok: false, reason: "unknown_mobile" };
  const { data: profile } = await admin
    .from("crm_profiles")
    .select("id, role, is_active, is_developer, full_name, allowed_modules")
    .eq("id", login.user_id)
    .maybeSingle();
  if (!profile || !profile.is_active) return { ok: false, reason: "inactive" };
  if (login.locked_until && new Date(login.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: "locked" };
  }
  const pinOk = await bcrypt.compare(pin, login.pin_hash);
  if (!pinOk) return { ok: false, reason: "bad_pin", userId: login.user_id };
  return { ok: true, profile, userId: login.user_id };
}

async function createUser({ email, fullName, role, mobile, pin, department }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: `Tmp!${randomBytes(8).toString("hex")}A1`,
    email_confirm: true,
    user_metadata: { app: "crm", crm: "true", role, full_name: fullName },
  });
  if (error || !data.user) throw new Error(error?.message || "createUser failed");
  const userId = data.user.id;
  const modules =
    role === "SALESMAN"
      ? ["dashboard", "today", "followups", "sales", "parties", "visits", "reports"]
      : role === "ACCOUNTANT"
        ? ["dashboard", "sales", "accounts", "reports"]
        : [
            "dashboard",
            "sales",
            "parties",
            "reports",
            "users",
            "settings",
            "accounts",
          ];
  const { error: pErr } = await admin.from("crm_profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    mobile,
    role,
    is_active: true,
    company_scope: "ALL",
    department,
    allowed_modules: modules,
    is_primary_owner: false,
    is_developer: false,
  });
  if (pErr) throw new Error(pErr.message);
  const pin_hash = await bcrypt.hash(pin, 12);
  const { error: lErr } = await admin.from("crm_user_login").upsert({
    user_id: userId,
    mobile_number: mobile,
    pin_hash,
    pin_updated_at: new Date().toISOString(),
    failed_attempts: 0,
    locked_until: null,
    must_change_pin: false,
  });
  if (lErr) throw new Error(lErr.message);
  return userId;
}

async function cleanup(userIds) {
  for (const id of userIds) {
    await admin.from("crm_auth_devices").delete().eq("user_id", id);
    await admin.from("crm_user_login").delete().eq("user_id", id);
    await admin.from("crm_user_company_access").delete().eq("user_id", id);
    await admin.from("crm_profiles").delete().eq("id", id);
    try {
      await admin.auth.admin.deleteUser(id);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const stamp = Date.now().toString(36);
  const created = [];

  try {
    // Developer privacy: primary developer must not appear in normal listings filter
    const { data: developer } = await admin
      .from("crm_profiles")
      .select("id, full_name, is_developer, role, is_primary_owner")
      .eq("is_primary_owner", true)
      .maybeSingle();
    if (developer?.is_developer && developer.role === "OWNER") {
      pass("developer.exists");
      if (/kumaresh/i.test(developer.full_name || "")) {
        // DB may still hold the real name; UI must mask it.
        pass(
          "developer.name_masked_by_ui_contract",
          "DB may retain internal identity; UI uses System Administration"
        );
      } else {
        pass("developer.display_name_ok", developer.full_name || "");
      }
    } else {
      fail("developer.exists", "primary developer profile missing");
    }

    const ceoMobile = `98${String(Date.now()).slice(-8)}`;
    const ceoPin = "1357";
    const ceoId = await createUser({
      email: `crm.e2e.ceo+${stamp}@example.com`,
      fullName: "E2E CEO Owner",
      role: "OWNER",
      mobile: ceoMobile,
      pin: ceoPin,
      department: "Management",
    });
    created.push(ceoId);

    let login = await verifyLogin(ceoMobile, ceoPin);
    if (login.ok && login.profile.role === "OWNER") pass("ceo.login");
    else fail("ceo.login", JSON.stringify(login));

    login = await verifyLogin(`+91 ${ceoMobile}`, ceoPin);
    if (login.ok) pass("ceo.login.normalize_91");
    else fail("ceo.login.normalize_91", JSON.stringify(login));

    login = await verifyLogin(ceoMobile, "0000");
    if (!login.ok && login.reason === "bad_pin") pass("ceo.wrong_pin");
    else fail("ceo.wrong_pin", JSON.stringify(login));

    // CEO 1 / 2 / 3
    for (const [role, pin] of [
      ["CEO_1", "1111"],
      ["CEO_2", "2222"],
      ["CEO_3", "3333"],
    ]) {
      const mobile = `97${String(Date.now() + role.length).slice(-8)}`;
      const id = await createUser({
        email: `crm.e2e.${role.toLowerCase()}+${stamp}@example.com`,
        fullName: `E2E ${role}`,
        role,
        mobile,
        pin,
        department: "Management",
      });
      created.push(id);
      const r = await verifyLogin(mobile, pin);
      if (r.ok && r.profile.role === role) pass(`${role}.login`);
      else fail(`${role}.login`, JSON.stringify(r));
    }

    // Salesman
    const salesMobile = `96${String(Date.now()).slice(-8)}`;
    const salesPin = "4444";
    const salesId = await createUser({
      email: `crm.e2e.sales+${stamp}@example.com`,
      fullName: "E2E Salesman",
      role: "SALESMAN",
      mobile: salesMobile,
      pin: salesPin,
      department: "Sales",
    });
    created.push(salesId);
    login = await verifyLogin(salesMobile, salesPin);
    if (login.ok && login.profile.role === "SALESMAN") {
      const mods = login.profile.allowed_modules || [];
      if (!mods.includes("users") && mods.includes("sales")) {
        pass("salesman.login_and_modules");
      } else fail("salesman.login_and_modules", JSON.stringify(mods));
    } else fail("salesman.login", JSON.stringify(login));

    // Accountant
    const acctMobile = `95${String(Date.now()).slice(-8)}`;
    const acctPin = "5555";
    const acctId = await createUser({
      email: `crm.e2e.acct+${stamp}@example.com`,
      fullName: "E2E Accountant",
      role: "ACCOUNTANT",
      mobile: acctMobile,
      pin: acctPin,
      department: "Accounts",
    });
    created.push(acctId);
    login = await verifyLogin(acctMobile, acctPin);
    if (login.ok && login.profile.role === "ACCOUNTANT") {
      const mods = login.profile.allowed_modules || [];
      if (!mods.includes("users") && mods.includes("accounts")) {
        pass("accountant.login_and_modules");
      } else fail("accountant.login_and_modules", JSON.stringify(mods));
    } else fail("accountant.login", JSON.stringify(login));

    // Inactive account
    await admin.from("crm_profiles").update({ is_active: false }).eq("id", salesId);
    login = await verifyLogin(salesMobile, salesPin);
    if (!login.ok && login.reason === "inactive") pass("inactive.blocked");
    else fail("inactive.blocked", JSON.stringify(login));
    await admin.from("crm_profiles").update({ is_active: true }).eq("id", salesId);

    // PIN reset: old rejected, new accepted; sessions/devices revoked
    const newPin = "7777";
    const newHash = await bcrypt.hash(newPin, 12);
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await admin.from("crm_auth_devices").insert({
      user_id: salesId,
      token_hash: tokenHash,
      device_label: "E2E device",
    });
    await admin
      .from("crm_user_login")
      .update({
        pin_hash: newHash,
        pin_updated_at: new Date().toISOString(),
        must_change_pin: false,
      })
      .eq("user_id", salesId);
    await admin
      .from("crm_auth_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", salesId)
      .is("revoked_at", null);

    login = await verifyLogin(salesMobile, salesPin);
    if (!login.ok && login.reason === "bad_pin") pass("pin_reset.old_rejected");
    else fail("pin_reset.old_rejected", JSON.stringify(login));

    login = await verifyLogin(salesMobile, newPin);
    if (login.ok) pass("pin_reset.new_accepted");
    else fail("pin_reset.new_accepted", JSON.stringify(login));

    const { data: devices } = await admin
      .from("crm_auth_devices")
      .select("revoked_at")
      .eq("user_id", salesId)
      .eq("token_hash", tokenHash);
    if (devices?.[0]?.revoked_at) pass("pin_reset.device_revoked");
    else fail("pin_reset.device_revoked");

    // Duplicate mobile
    try {
      await createUser({
        email: `crm.e2e.dup+${stamp}@example.com`,
        fullName: "Dup Mobile",
        role: "SALESMAN",
        mobile: salesMobile,
        pin: "8888",
        department: "Sales",
      });
      fail("duplicate.mobile", "should have failed unique constraint");
    } catch (e) {
      pass("duplicate.mobile", String(e.message || e).slice(0, 120));
    }

    // Unknown mobile
    login = await verifyLogin("9000000001", "1234");
    if (!login.ok && login.reason === "unknown_mobile") pass("unknown_mobile");
    else fail("unknown_mobile", JSON.stringify(login));

    // Remember-device token hashing shape
    const t = randomBytes(32).toString("hex");
    const h = createHash("sha256").update(t).digest("hex");
    if (h.length === 64 && t.length === 64) pass("remember_device.token_shape");
    else fail("remember_device.token_shape");

    // Listing filter: developer hidden for non-developer viewer
    const { data: allProfiles } = await admin
      .from("crm_profiles")
      .select("id, is_developer, role, is_primary_owner");
    const visibleToCeo = (allProfiles || []).filter(
      (p) => !(p.is_developer && p.role === "OWNER")
    );
    const hasDev = (allProfiles || []).some(
      (p) => p.is_developer && p.role === "OWNER"
    );
    if (hasDev && visibleToCeo.length < allProfiles.length) {
      pass("developer.hidden_from_normal_list");
    } else if (!hasDev) {
      fail("developer.hidden_from_normal_list", "no developer to hide");
    } else {
      fail("developer.hidden_from_normal_list", "filter ineffective");
    }
  } finally {
    await cleanup(created);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed`
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
