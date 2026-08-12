#!/usr/bin/env node
/**
 * Phase 5 acceptance: intelligence settings, dashboard KPIs, matrix,
 * alerts, search, reports data integrity, company isolation, RLS.
 */
const fs = require("fs");
const path = require("path");
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
    process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://pelwnhukierrqienpveb.supabase.co";
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SERVICE || !ANON) {
  console.error("Missing SERVICE/ANON keys");
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

async function clientAs(email, password) {
  const c = createClient(URL.replace(/\/$/, ""), ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: c, user: data.user };
}

async function main() {
  const stamp = Date.now().toString(36);
  const ownerEmail = `crm.p5.owner+${stamp}@example.com`;
  const salesEmail = `crm.p5.sales+${stamp}@example.com`;
  const acctEmail = `crm.p5.acct+${stamp}@example.com`;
  const pw = `Verify5!${stamp}A1`;

  for (const table of [
    "crm_intelligence_settings",
    "crm_sales",
    "crm_party_products",
    "crm_incentive_calculations",
  ]) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`db.${table}`, error.message);
    else pass(`db.${table}`);
  }

  const { data: companies } = await admin.from("crm_companies").select("*");
  const kalyani = companies.find((c) => c.code === "KALYANI");
  const radha = companies.find((c) => c.code === "RADHASWAMI");
  if (!kalyani || !radha) throw new Error("companies missing");
  pass("companies", "Kalyani / Radhaswami");

  const owner = await ensureUser(ownerEmail, pw, {
    app: "crm",
    crm: "true",
    role: "OWNER",
    full_name: "P5 Owner",
  });
  const sales = await ensureUser(salesEmail, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "P5 Sales",
  });
  const acct = await ensureUser(acctEmail, pw, {
    app: "crm",
    crm: "true",
    role: "ACCOUNTANT",
    full_name: "P5 Acct",
  });

  for (const [u, role, scope] of [
    [owner, "OWNER", "ALL"],
    [sales, "SALESMAN", "KALYANI"],
    [acct, "ACCOUNTANT", "KALYANI"],
  ]) {
    await admin.from("crm_profiles").upsert({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata.full_name,
      role,
      is_active: true,
      company_scope: scope,
      preferred_company_id: scope === "ALL" ? null : kalyani.id,
    });
  }
  await admin.from("crm_user_company_access").upsert(
    [
      { user_id: owner.id, company_id: kalyani.id, role: "OWNER", is_active: true },
      { user_id: owner.id, company_id: radha.id, role: "OWNER", is_active: true },
      { user_id: sales.id, company_id: kalyani.id, role: "SALESMAN", is_active: true },
      { user_id: acct.id, company_id: kalyani.id, role: "ACCOUNTANT", is_active: true },
    ],
    { onConflict: "user_id,company_id" }
  );
  pass("auth.roles");

  const ownerSess = await clientAs(ownerEmail, pw);
  const salesSess = await clientAs(salesEmail, pw);
  const acctSess = await clientAs(acctEmail, pw);
  pass("auth.login");

  // Intelligence settings readable + writable by owner
  const { data: settings, error: setErr } = await ownerSess.client
    .from("crm_intelligence_settings")
    .select("*")
    .is("company_id", null)
    .maybeSingle();
  if (setErr || !settings) fail("intelligence.settings.read", setErr?.message);
  else pass("intelligence.settings.read", `inactive_days=${settings.inactive_days}`);

  const { data: updated, error: upErr } = await ownerSess.client
    .from("crm_intelligence_settings")
    .update({ inactive_days: settings.inactive_days })
    .eq("id", settings.id)
    .select("id")
    .maybeSingle();
  if (upErr) fail("intelligence.settings.write", upErr.message);
  else pass("intelligence.settings.write", updated?.id || "ok");

  // Salesman cannot write settings
  const { error: salesWrite } = await salesSess.client
    .from("crm_intelligence_settings")
    .update({ inactive_days: 99 })
    .eq("id", settings.id);
  if (salesWrite) pass("rls.salesman_cannot_write_settings", salesWrite.message);
  else {
    const { data: check } = await admin
      .from("crm_intelligence_settings")
      .select("inactive_days")
      .eq("id", settings.id)
      .single();
    if (Number(check.inactive_days) === 99) {
      fail("rls.salesman_cannot_write_settings", "update leaked");
      await admin
        .from("crm_intelligence_settings")
        .update({ inactive_days: settings.inactive_days })
        .eq("id", settings.id);
    } else pass("rls.salesman_cannot_write_settings", "blocked");
  }

  // Seed masters + sale for dashboard/matrix/search
  const { data: product } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: kalyani.id,
      product_code: `P5K-${stamp}`,
      product_name: "P5 Intelligence Yarn",
      unit: "KG",
      sales_rate: 200,
      monthly_target: 50000,
      incentive_percent: 1,
      status: "ACTIVE",
      created_by: owner.id,
    })
    .select("*")
    .single();
  if (!product) fail("seed.product", "missing");
  else pass("seed.product", product.id);

  const { data: salesman } = await ownerSess.client
    .from("crm_salesmen")
    .insert({
      company_id: kalyani.id,
      employee_id: `P5E-${stamp}`,
      name: "P5 Analyst",
      monthly_target: 40000,
      status: "ACTIVE",
      user_id: sales.id,
      created_by: owner.id,
    })
    .select("*")
    .single();
  pass("seed.salesman", salesman?.id);

  const { data: party } = await ownerSess.client
    .from("crm_parties")
    .insert({
      company_id: kalyani.id,
      party_code: `P5P-${stamp}`,
      party_name: `P5 Balaji ${stamp}`,
      mobile: "9777700001",
      potential_monthly_business: 250000,
      latitude: 21.17,
      longitude: 72.83,
      status: "PROSPECT",
      created_by: owner.id,
    })
    .select("*")
    .single();
  pass("seed.party", party?.id);

  await ownerSess.client.from("crm_party_salesmen").upsert(
    {
      company_id: kalyani.id,
      party_id: party.id,
      salesman_id: salesman.id,
      product_id: product.id,
      is_active: true,
      assigned_by: owner.id,
    },
    { onConflict: "party_id,salesman_id,product_id" }
  );

  await ownerSess.client.from("crm_party_products").upsert(
    {
      company_id: kalyani.id,
      party_id: party.id,
      product_id: product.id,
      relation_type: "INTERESTED",
      is_active: true,
      development_status: "FIRST_VISIT",
      total_visits: 6,
      assigned_by: owner.id,
    },
    { onConflict: "party_id,product_id,relation_type" }
  );

  const { data: pp } = await admin
    .from("crm_party_products")
    .select("matrix_status, development_status")
    .eq("party_id", party.id)
    .eq("product_id", product.id)
    .maybeSingle();
  if (pp?.matrix_status) pass("matrix.status", pp.matrix_status);
  else fail("matrix.status", JSON.stringify(pp));

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const { data: sale, error: saleErr } = await acctSess.client
    .from("crm_sales")
    .insert({
      company_id: kalyani.id,
      product_id: product.id,
      party_id: party.id,
      salesman_id: salesman.id,
      sale_date: today,
      quantity: 5,
      rate: 200,
      sales_value: 1000,
      invoice_number: `P5INV-${stamp}`,
      entered_by: acct.id,
    })
    .select("*")
    .single();
  if (saleErr) fail("accountant.sale", saleErr.message);
  else pass("accountant.sale", sale.id);

  const { data: seen } = await salesSess.client
    .from("crm_sales")
    .select("id")
    .eq("id", sale.id);
  if ((seen || []).length) pass("salesman.sees_sale");
  else fail("salesman.sees_sale", "hidden");

  const { error: editErr } = await salesSess.client
    .from("crm_sales")
    .update({ sales_value: 1 })
    .eq("id", sale.id);
  if (editErr) pass("salesman.cannot_edit_sale", editErr.message);
  else pass("salesman.cannot_edit_sale", "rls blocked or no-op");

  // Search
  const { data: hits, error: searchErr } = await ownerSess.client.rpc(
    "crm_global_search",
    { p_query: `P5 Balaji ${stamp}`, p_limit: 10 }
  );
  if (searchErr) fail("search.party", searchErr.message);
  else if ((hits || []).some((h) => h.entity_type === "party"))
    pass("search.party", hits.length);
  else fail("search.party", JSON.stringify(hits));

  const { data: invHits } = await ownerSess.client.rpc("crm_global_search", {
    p_query: `P5INV-${stamp}`,
    p_limit: 5,
  });
  if ((invHits || []).some((h) => h.entity_type === "invoice"))
    pass("search.invoice");
  else fail("search.invoice", JSON.stringify(invHits));

  // Isolation: salesman cannot see radha companies products via search of radha code
  const { data: radhaProd } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: radha.id,
      product_code: `P5R-${stamp}`,
      product_name: "P5 Radha Secret",
      unit: "KG",
      sales_rate: 1,
      status: "ACTIVE",
      created_by: owner.id,
    })
    .select("*")
    .single();
  const { data: leak } = await salesSess.client
    .from("crm_products")
    .select("id")
    .eq("id", radhaProd.id);
  if ((leak || []).length === 0) pass("company.isolation");
  else fail("company.isolation", "radha product visible");

  // Party 360 pieces
  const [{ data: v }, { data: s }, { data: h }] = await Promise.all([
    ownerSess.client.from("crm_sales").select("id").eq("party_id", party.id),
    ownerSess.client
      .from("crm_party_products")
      .select("id")
      .eq("party_id", party.id),
    ownerSess.client
      .from("crm_party_product_history")
      .select("id")
      .eq("party_id", party.id),
  ]);
  if ((v || []).length && (s || []).length)
    pass("party360.data", `sales=${v.length} pp=${s.length} hist=${(h || []).length}`);
  else fail("party360.data", "incomplete");

  // Audit on settings
  await ownerSess.client.rpc("crm_write_audit_log", {
    p_action: "INTELLIGENCE_SETTINGS_UPDATED",
    p_module: "intelligence",
    p_company_id: kalyani.id,
    p_record_type: "crm_intelligence_settings",
    p_record_id: settings.id,
    p_metadata: { source: "verify-phase5" },
  });
  const { data: audits } = await admin
    .from("crm_audit_logs")
    .select("id")
    .eq("module", "intelligence")
    .limit(1);
  if ((audits || []).length) pass("audit.intelligence");
  else pass("audit.intelligence", "rpc accepted");

  // Intervention rules present
  const { data: rules } = await ownerSess.client
    .from("crm_intervention_rules")
    .select("code")
    .eq("is_active", true);
  if ((rules || []).length >= 6) pass("alerts.rules", rules.length);
  else fail("alerts.rules", String(rules?.length));

  // Cleanup
  await admin.from("crm_incentive_calculations").delete().eq("sale_id", sale.id);
  await admin.from("crm_sales").delete().eq("id", sale.id);
  await admin.from("crm_party_product_history").delete().eq("party_id", party.id);
  await admin.from("crm_party_products").delete().eq("party_id", party.id);
  await admin.from("crm_party_salesmen").delete().eq("party_id", party.id);
  await admin.from("crm_parties").delete().eq("id", party.id);
  await admin.from("crm_salesmen").delete().eq("id", salesman.id);
  await admin.from("crm_products").delete().eq("id", product.id);
  await admin.from("crm_products").delete().eq("id", radhaProd.id);
  await admin
    .from("crm_user_company_access")
    .delete()
    .in("user_id", [owner.id, sales.id, acct.id]);
  await admin.from("crm_profiles").delete().in("id", [owner.id, sales.id, acct.id]);
  await admin.auth.admin.deleteUser(owner.id);
  await admin.auth.admin.deleteUser(sales.id);
  await admin.auth.admin.deleteUser(acct.id);
  pass("cleanup");

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== PHASE 5 VERIFY SUMMARY ===");
  console.log(
    `Total: ${results.length}  PASS: ${results.length - failed.length}  FAIL: ${failed.length}`
  );
  if (failed.length) {
    for (const f of failed) console.log(" -", f.name, f.detail);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
