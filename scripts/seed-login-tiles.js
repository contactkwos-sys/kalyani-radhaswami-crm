#!/usr/bin/env node
/**
 * Seed role-tile login users on the CRM Supabase project (server-side only).
 * Creates auth.users + app_users + crm_profiles + company access.
 *
 * Usage:
 *   node scripts/seed-login-tiles.js
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY, optional NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 */
const { createClient } = require("@supabase/supabase-js");

const PEPPER = "kwos-kalyani-radhaswami-2026";
const URL =
  process.env.KALYANI_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://pelwnhukierrqienpveb.supabase.co";
const SERVICE =
  process.env.KALYANI_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.KALYANI_SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY;

const SUBTITLES = {
  admin: "System administrator",
  ceo: "Chief Executive / Management",
  accountant: "Accounts & entries",
  salesman: "Field sales",
};

const TILES = [
  {
    loginSlug: "admin",
    displayName: "Admin",
    role: "admin",
    crmRole: "ADMIN",
    // Temporary PIN must come from env — never commit production PINs.
    tempPin: process.env.SEED_ADMIN_PIN || "",
    sortOrder: 10,
  },
  {
    loginSlug: "ceo",
    displayName: "CEO",
    role: "ceo",
    crmRole: "CEO_1",
    tempPin: process.env.SEED_CEO_PIN || "",
    sortOrder: 20,
  },
  {
    loginSlug: "accountant",
    displayName: "Accountant",
    role: "accountant",
    crmRole: "ACCOUNTANT",
    tempPin: process.env.SEED_ACCOUNTANT_PIN || "",
    sortOrder: 30,
  },
  {
    loginSlug: "salesman_01",
    displayName: "Salesman 01",
    role: "salesman",
    crmRole: "SALESMAN",
    tempPin: process.env.SEED_SALESMAN_01_PIN || "",
    sortOrder: 40,
  },
  {
    loginSlug: "salesman_02",
    displayName: "Salesman 02",
    role: "salesman",
    crmRole: "SALESMAN",
    tempPin: process.env.SEED_SALESMAN_02_PIN || "",
    sortOrder: 50,
  },
];

function password(slug, pin) {
  return `${pin}-${slug}-${PEPPER}`;
}

async function main() {
  if (!SERVICE) {
    console.error("SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }

  for (const tile of TILES) {
    if (!/^\d{4,8}$/.test(tile.tempPin || "")) {
      console.error(
        `Missing/invalid PIN for ${tile.loginSlug}. Set SEED_*_PIN env vars (4–8 digits).`
      );
      process.exit(1);
    }
  }

  const admin = createClient(URL.replace(/\/$/, ""), SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: companies, error: coErr } = await admin
    .from("crm_companies")
    .select("id, code")
    .in("code", ["KALYANI", "RADHASWAMI"]);
  if (coErr) throw coErr;
  if (!companies?.length) {
    throw new Error("crm_companies missing — wrong Supabase project?");
  }

  const seeded = [];

  for (const tile of TILES) {
    const email = `${tile.loginSlug}@internal.kwos.local`;

    const { data: existing } = await admin
      .from("app_users")
      .select("id, login_slug, display_name")
      .eq("login_slug", tile.loginSlug)
      .maybeSingle();

    if (existing) {
      // Repair hard-coded personal CEO labels on existing tiles.
      if (
        tile.role === "ceo" &&
        (String(existing.display_name || "").toLowerCase().includes("kailash") ||
          String(existing.display_name || "").startsWith("CEO ("))
      ) {
        await admin
          .from("app_users")
          .update({
            display_name: "CEO",
            role_subtitle: SUBTITLES.ceo,
          })
          .eq("id", existing.id);
        console.log("Updated CEO display_name → CEO:", existing.id);
      }
      console.log("Skip (exists):", tile.loginSlug, existing.id);
      seeded.push({ ...tile, id: existing.id, skipped: true });
      continue;
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: password(tile.loginSlug, tile.tempPin),
      email_confirm: true,
      user_metadata: {
        app: "crm",
        crm: "true",
        role: tile.crmRole,
        full_name: tile.displayName,
      },
    });
    if (authErr) throw new Error(`${tile.loginSlug} auth: ${authErr.message}`);

    const id = authUser.user.id;

    const { error: appErr } = await admin.from("app_users").insert({
      id,
      login_slug: tile.loginSlug,
      display_name: tile.displayName,
      role: tile.role,
      role_subtitle: SUBTITLES[tile.role] || null,
      pin_is_set: false,
      is_active: true,
      sort_order: tile.sortOrder,
    });
    if (appErr) {
      await admin.auth.admin.deleteUser(id);
      throw new Error(`${tile.loginSlug} app_users: ${appErr.message}`);
    }

    // Ensure CRM profile (trigger may already have inserted).
    // Exec + accountant default to ALL so Kalyani and Radhaswami both open.
    const scopeAll =
      tile.crmRole === "ADMIN" ||
      tile.crmRole === "CEO_1" ||
      tile.crmRole === "ACCOUNTANT";
    const { error: profErr } = await admin.from("crm_profiles").upsert(
      {
        id,
        email,
        full_name: tile.displayName,
        role: tile.crmRole,
        is_active: true,
        company_scope: scopeAll ? "ALL" : "KALYANI",
        preferred_company_id: null,
      },
      { onConflict: "id" }
    );
    if (profErr) console.warn("profile upsert:", tile.loginSlug, profErr.message);

    for (const company of companies) {
      const accessRole =
        tile.crmRole === "CEO_1" || tile.crmRole === "ADMIN"
          ? tile.crmRole === "CEO_1"
            ? "OWNER"
            : "ADMIN"
          : tile.crmRole;
      const { error: accErr } = await admin
        .from("crm_user_company_access")
        .upsert(
          {
            user_id: id,
            company_id: company.id,
            role: accessRole,
            is_active: true,
          },
          { onConflict: "user_id,company_id" }
        );
      if (accErr) console.warn("access:", tile.loginSlug, accErr.message);
    }

    console.log("Created:", tile.loginSlug, id);
    seeded.push({ ...tile, id, skipped: false });
  }

  const { data: tiles, error: rpcErr } = await admin.rpc("list_login_users");
  if (rpcErr) throw rpcErr;

  console.log("\nlist_login_users =>", JSON.stringify(tiles, null, 2));
  console.log(
    "\nTemporary PINs were taken from SEED_*_PIN env vars (not printed)."
  );
  console.log("Tiles:", seeded.map((s) => s.loginSlug).join(", "));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
