#!/usr/bin/env node
/**
 * Bootstrap CRM owner user (server-side only).
 * Usage:
 *   OWNER_EMAIL=... OWNER_PASSWORD=... OWNER_NAME="..." node scripts/seed-owner.js
 */
const { createClient } = require("@supabase/supabase-js");

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ixulyhomqtajenigopai.supabase.co";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

async function main() {
  const email = process.env.OWNER_EMAIL || process.env.CRM_OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD || process.env.CRM_OWNER_PASSWORD;
  const fullName =
    process.env.OWNER_NAME || process.env.CRM_OWNER_NAME || "Owner";

  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  if (!email || !password) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD required");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = listed?.users?.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        app: "crm",
        crm: "true",
        role: "OWNER",
        full_name: fullName,
      },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created auth user", user.id);
  } else {
    console.log("Auth user exists", user.id);
    await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...(user.user_metadata || {}),
        app: "crm",
        crm: "true",
        role: "OWNER",
        full_name: fullName,
      },
    });
  }

  const { error: upsertError } = await admin.from("crm_profiles").upsert({
    id: user.id,
    email,
    full_name: fullName,
    role: "OWNER",
    is_active: true,
    company_scope: "ALL",
  });
  if (upsertError) throw upsertError;

  const { data: companies, error: cErr } = await admin
    .from("crm_companies")
    .select("id, code");
  if (cErr) throw cErr;

  for (const c of companies || []) {
    const { error } = await admin.from("crm_user_company_access").upsert(
      {
        user_id: user.id,
        company_id: c.id,
        role: "OWNER",
        is_active: true,
      },
      { onConflict: "user_id,company_id" }
    );
    if (error) throw error;
  }

  console.log("Owner profile ready for", email);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
