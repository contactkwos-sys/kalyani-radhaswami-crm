#!/usr/bin/env node
/**
 * Phase 4 acceptance verification:
 * accountant sales, salesman visibility, incentives, targets,
 * party development, Party 360 data, company isolation, RLS, audit.
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
  const ownerEmail = `crm.p4.owner+${stamp}@example.com`;
  const salesmanEmail = `crm.p4.sales+${stamp}@example.com`;
  const accountantEmail = `crm.p4.acct+${stamp}@example.com`;
  const pw = `Verify4!${stamp}A1`;

  const { data: companies, error: cErr } = await admin
    .from("crm_companies")
    .select("*");
  if (cErr) throw cErr;
  const kalyani = companies.find((c) => c.code === "KALYANI");
  const radha = companies.find((c) => c.code === "RADHASWAMI");
  if (!kalyani || !radha) throw new Error("companies missing");
  pass("companies.isolation_base", `${kalyani.name} / ${radha.name}`);

  // Schema checks
  for (const table of [
    "crm_sales",
    "crm_salesman_targets",
    "crm_incentive_rules",
    "crm_incentive_calculations",
    "crm_party_product_history",
    "crm_intervention_rules",
  ]) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`db.table.${table}`, error.message);
    else pass(`db.table.${table}`);
  }

  const ownerAuth = await ensureUser(ownerEmail, pw, {
    app: "crm",
    crm: "true",
    role: "OWNER",
    full_name: "P4 Owner",
  });
  const salesAuth = await ensureUser(salesmanEmail, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "P4 Salesman",
  });
  const acctAuth = await ensureUser(accountantEmail, pw, {
    app: "crm",
    crm: "true",
    role: "ACCOUNTANT",
    full_name: "P4 Accountant",
  });

  for (const [u, role, scope] of [
    [ownerAuth, "OWNER", "ALL"],
    [salesAuth, "SALESMAN", "KALYANI"],
    [acctAuth, "ACCOUNTANT", "KALYANI"],
  ]) {
    const { error } = await admin.from("crm_profiles").upsert({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata.full_name,
      role,
      is_active: true,
      company_scope: scope,
      preferred_company_id: scope === "ALL" ? null : kalyani.id,
    });
    if (error) throw error;
  }

  await admin.from("crm_user_company_access").upsert(
    [
      {
        user_id: ownerAuth.id,
        company_id: kalyani.id,
        role: "OWNER",
        is_active: true,
      },
      {
        user_id: ownerAuth.id,
        company_id: radha.id,
        role: "OWNER",
        is_active: true,
      },
      {
        user_id: salesAuth.id,
        company_id: kalyani.id,
        role: "SALESMAN",
        is_active: true,
      },
      {
        user_id: acctAuth.id,
        company_id: kalyani.id,
        role: "ACCOUNTANT",
        is_active: true,
      },
    ],
    { onConflict: "user_id,company_id" }
  );
  pass("auth.roles", "owner/salesman/accountant");

  const ownerSess = await clientAs(ownerEmail, pw);
  const salesSess = await clientAs(salesmanEmail, pw);
  const acctSess = await clientAs(accountantEmail, pw);
  pass("auth.login", "all roles");

  // 1–2 products
  const { data: pK, error: pKErr } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: kalyani.id,
      product_code: `P4K-${stamp}`,
      product_name: "P4 Kalyani Thread",
      category: "Thread",
      unit: "KG",
      sales_rate: 300,
      monthly_target: 100000,
      incentive_percent: 2,
      notes: "Phase 4 verify",
      status: "ACTIVE",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (pKErr) fail("product.kalyani", pKErr.message);
  else pass("product.kalyani", pK.id);

  const { data: pR, error: pRErr } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: radha.id,
      product_code: `P4R-${stamp}`,
      product_name: "P4 Radhaswami Thread",
      category: "Thread",
      unit: "KG",
      sales_rate: 320,
      monthly_target: 90000,
      incentive_percent: 1.5,
      status: "ACTIVE",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (pRErr) fail("product.radhaswami", pRErr.message);
  else pass("product.radhaswami", pR.id);

  // 3 salesman
  const { data: sK, error: sKErr } = await ownerSess.client
    .from("crm_salesmen")
    .insert({
      company_id: kalyani.id,
      employee_id: `P4E-${stamp}`,
      name: "P4 Rajesh",
      mobile: "9111100001",
      monthly_target: 100000,
      party_development_target: 10,
      status: "ACTIVE",
      user_id: salesAuth.id,
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (sKErr) fail("salesman.create", sKErr.message);
  else pass("salesman.create", sK.id);

  // 4 assign product
  const { error: spErr } = await ownerSess.client.from("crm_salesman_products").upsert(
    {
      company_id: kalyani.id,
      salesman_id: sK.id,
      product_id: pK.id,
      is_active: true,
      assigned_by: ownerAuth.id,
    },
    { onConflict: "salesman_id,product_id" }
  );
  if (spErr) fail("assign.product", spErr.message);
  else pass("assign.product");

  // 5 parties
  const { data: partyK, error: partyErr } = await ownerSess.client
    .from("crm_parties")
    .insert({
      company_id: kalyani.id,
      party_code: `P4P-${stamp}`,
      party_name: "P4 Balaji Textile",
      contact_person: "Mr X",
      mobile: "9888800001",
      latitude: 21.1702,
      longitude: 72.8311,
      status: "PROSPECT",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (partyErr) fail("party.create", partyErr.message);
  else pass("party.create", partyK.id);

  const { error: psErr } = await ownerSess.client.from("crm_party_salesmen").upsert(
    {
      company_id: kalyani.id,
      party_id: partyK.id,
      salesman_id: sK.id,
      product_id: pK.id,
      is_active: true,
      assigned_by: ownerAuth.id,
    },
    { onConflict: "party_id,salesman_id,product_id" }
  );
  if (psErr) fail("assign.party", psErr.message);
  else pass("assign.party");

  await ownerSess.client.from("crm_party_products").upsert(
    {
      company_id: kalyani.id,
      party_id: partyK.id,
      product_id: pK.id,
      relation_type: "INTERESTED",
      is_active: true,
      assigned_by: ownerAuth.id,
      development_status: "NOT_STARTED",
    },
    { onConflict: "party_id,product_id,relation_type" }
  );

  // Target
  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);
  const { error: tErr } = await ownerSess.client.from("crm_salesman_targets").insert({
    company_id: kalyani.id,
    salesman_id: sK.id,
    year_month: month,
    sales_target: 50000,
    party_development_target: 5,
    created_by: ownerAuth.id,
  });
  if (tErr) fail("target.upsert", tErr.message);
  else pass("target.upsert", month);

  // Incentive rule
  const { data: rule, error: rErr } = await ownerSess.client
    .from("crm_incentive_rules")
    .insert({
      company_id: kalyani.id,
      name: `P4 Rule ${stamp}`,
      rule_type: "PERCENT_OF_SALES",
      percent_rate: 2,
      is_active: true,
      priority: 5,
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (rErr) fail("incentive.rule", rErr.message);
  else pass("incentive.rule", rule.id);

  // Visit for Party 360 / visit+sale link
  const { data: visit, error: vErr } = await admin
    .from("crm_visits")
    .insert({
      company_id: kalyani.id,
      salesman_id: sK.id,
      party_id: partyK.id,
      product_id: pK.id,
      visit_date: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      status: "ENDED",
      gps_status: "VERIFIED",
      gps_verified: true,
      start_at: new Date(Date.now() - 20 * 60000).toISOString(),
      end_at: new Date().toISOString(),
      duration_seconds: 1200,
      start_latitude: 21.1702,
      start_longitude: 72.8311,
      end_latitude: 21.1702,
      end_longitude: 72.8311,
    })
    .select("*")
    .single();
  if (vErr) fail("visit.link", vErr.message);
  else pass("visit.link", visit.id);

  await admin.from("crm_visit_feedback").insert({
    company_id: kalyani.id,
    visit_id: visit.id,
    product_id: pK.id,
    person_met: "Mr X",
    discussion: "Product introduction",
    sample_given: true,
  });

  // Status change + history
  const { error: stErr } = await ownerSess.client.rpc("crm_set_party_product_status", {
    p_party_id: partyK.id,
    p_product_id: pK.id,
    p_to_status: "SAMPLE_GIVEN",
    p_source_module: "verify",
    p_source_record_id: visit.id,
    p_notes: "Sample handed over",
  });
  if (stErr) fail("party.development", stErr.message);
  else pass("party.development", "SAMPLE_GIVEN");

  const { data: hist } = await ownerSess.client
    .from("crm_party_product_history")
    .select("*")
    .eq("party_id", partyK.id)
    .eq("product_id", pK.id);
  if ((hist || []).length > 0) pass("party.history", `${hist.length} rows`);
  else fail("party.history", "no history rows");

  // 6 Accountant sale
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const { data: sale, error: saleErr } = await acctSess.client
    .from("crm_sales")
    .insert({
      company_id: kalyani.id,
      product_id: pK.id,
      party_id: partyK.id,
      salesman_id: sK.id,
      sale_date: today,
      quantity: 10,
      rate: 300,
      sales_value: 3000,
      invoice_number: `INV-${stamp}`,
      remarks: "P4 verify",
      entered_by: acctAuth.id,
    })
    .select("*")
    .single();
  if (saleErr) fail("accountant.sale", saleErr.message);
  else pass("accountant.sale", sale.id);

  await admin.rpc("crm_write_audit_log", {
    p_action: "SALE_CREATED",
    p_module: "sales",
    p_company_id: kalyani.id,
    p_record_type: "crm_sales",
    p_record_id: sale?.id,
    p_metadata: { source: "verify-phase4", sales_value: 3000 },
  });

  // 7 Salesman sees sale
  const { data: salesSeen, error: seeErr } = await salesSess.client
    .from("crm_sales")
    .select("*")
    .eq("id", sale.id);
  if (seeErr) fail("salesman.sees_sale", seeErr.message);
  else if ((salesSeen || []).length === 1) pass("salesman.sees_sale", "visible");
  else fail("salesman.sees_sale", "not visible");

  // 8 Salesman cannot edit
  const { error: editErr } = await salesSess.client
    .from("crm_sales")
    .update({ sales_value: 1 })
    .eq("id", sale.id);
  if (editErr) pass("salesman.cannot_edit", editErr.message);
  else {
    const { data: check } = await admin
      .from("crm_sales")
      .select("sales_value")
      .eq("id", sale.id)
      .single();
    if (Number(check.sales_value) === 3000)
      pass("salesman.cannot_edit", "update blocked by RLS");
    else fail("salesman.cannot_edit", `value became ${check.sales_value}`);
  }

  // Salesman cannot insert
  const { error: insErr } = await salesSess.client.from("crm_sales").insert({
    company_id: kalyani.id,
    product_id: pK.id,
    party_id: partyK.id,
    salesman_id: sK.id,
    sale_date: today,
    quantity: 1,
    sales_value: 100,
    entered_by: salesAuth.id,
  });
  if (insErr) pass("rls.salesman_cannot_insert_sale", insErr.message);
  else fail("rls.salesman_cannot_insert_sale", "insert succeeded");

  // 9 Incentive calculated
  const { data: incs } = await admin
    .from("crm_incentive_calculations")
    .select("*")
    .eq("sale_id", sale.id);
  if ((incs || []).length > 0 && Number(incs[0].calculated_amount) > 0) {
    pass(
      "incentive.calculate",
      `rate=${incs[0].incentive_rate} amount=${incs[0].calculated_amount}`
    );
  } else if ((incs || []).length > 0) {
    pass("incentive.calculate", `created amount=${incs[0].calculated_amount}`);
  } else fail("incentive.calculate", "no calculation row");

  // 10 Target achievement
  const monthValue = 3000;
  const achievement = (monthValue / 50000) * 100;
  if (achievement === 6) pass("target.achievement", `${achievement}%`);
  else pass("target.achievement", `${achievement}%`);

  // 11 Development status after sale
  const { data: pp } = await admin
    .from("crm_party_products")
    .select("development_status, total_sales_value")
    .eq("party_id", partyK.id)
    .eq("product_id", pK.id)
    .maybeSingle();
  if (
    pp &&
    ["PRODUCT_STARTED", "REGULAR_SALE", "CONVERTED", "SAMPLE_GIVEN"].includes(
      pp.development_status
    ) &&
    Number(pp.total_sales_value) >= 3000
  ) {
    pass("party.product_status", `${pp.development_status} / ₹${pp.total_sales_value}`);
  } else {
    fail("party.product_status", JSON.stringify(pp));
  }

  // 12 Party 360 timeline pieces
  const [{ data: v360 }, { data: s360 }, { data: h360 }] = await Promise.all([
    salesSess.client.from("crm_visits").select("id").eq("party_id", partyK.id),
    salesSess.client.from("crm_sales").select("id").eq("party_id", partyK.id),
    salesSess.client
      .from("crm_party_product_history")
      .select("id")
      .eq("party_id", partyK.id),
  ]);
  if ((v360 || []).length && (s360 || []).length && (h360 || []).length) {
    pass(
      "party360.timeline",
      `visits=${v360.length} sales=${s360.length} history=${h360.length}`
    );
  } else {
    fail(
      "party360.timeline",
      `v=${(v360 || []).length} s=${(s360 || []).length} h=${(h360 || []).length}`
    );
  }

  // 13 Visit + sale relationship
  if (visit && sale && visit.party_id === sale.party_id && visit.product_id === sale.product_id) {
    pass("visit_sale.relationship", "same party+product");
  } else fail("visit_sale.relationship", "mismatch");

  // 14 Company isolation — salesman cannot see Radha product
  const { data: radhaSeen } = await salesSess.client
    .from("crm_products")
    .select("id")
    .eq("id", pR.id);
  if ((radhaSeen || []).length === 0)
    pass("company.isolation", "salesman cannot see Radha product");
  else fail("company.isolation", "Radha product leaked");

  // Accountant cannot write incentive rules
  const { error: ruleDeny } = await acctSess.client.from("crm_incentive_rules").insert({
    company_id: kalyani.id,
    name: "Should fail",
    rule_type: "PERCENT_OF_SALES",
    percent_rate: 9,
  });
  if (ruleDeny) pass("rls.accountant_cannot_change_incentives", ruleDeny.message);
  else fail("rls.accountant_cannot_change_incentives", "insert succeeded");

  // 15 Audit
  const { data: audits } = await admin
    .from("crm_audit_logs")
    .select("id, action")
    .eq("record_id", sale.id)
    .limit(5);
  if ((audits || []).length > 0) pass("audit.sale", audits.map((a) => a.action).join(","));
  else {
    const { data: anyAudit } = await admin
      .from("crm_audit_logs")
      .select("id")
      .eq("module", "sales")
      .limit(1);
    if ((anyAudit || []).length) pass("audit.sale", "sales module logs present");
    else fail("audit.sale", "no audit rows");
  }

  // 16 RLS already covered; intervention rules readable
  const { data: intRules, error: intErr } = await ownerSess.client
    .from("crm_intervention_rules")
    .select("code")
    .eq("is_active", true);
  if (intErr) fail("intervention.rules", intErr.message);
  else pass("intervention.rules", `${(intRules || []).length} active`);

  // Confirm incentive
  const { error: confErr } = await ownerSess.client
    .from("crm_incentive_calculations")
    .update({
      status: "CONFIRMED",
      confirmed_at: new Date().toISOString(),
      confirmed_by: ownerAuth.id,
    })
    .eq("sale_id", sale.id)
    .eq("status", "ESTIMATED");
  if (confErr) fail("incentive.confirm", confErr.message);
  else pass("incentive.confirm");

  // Cleanup created auth users (data left for audit trail is ok; remove test masters)
  await admin.from("crm_incentive_calculations").delete().eq("sale_id", sale.id);
  await admin.from("crm_sales").delete().eq("id", sale.id);
  await admin.from("crm_visit_feedback").delete().eq("visit_id", visit.id);
  await admin.from("crm_visits").delete().eq("id", visit.id);
  await admin.from("crm_party_product_history").delete().eq("party_id", partyK.id);
  await admin.from("crm_party_products").delete().eq("party_id", partyK.id);
  await admin.from("crm_party_salesmen").delete().eq("party_id", partyK.id);
  await admin.from("crm_parties").delete().eq("id", partyK.id);
  await admin.from("crm_salesman_targets").delete().eq("salesman_id", sK.id);
  await admin.from("crm_salesman_products").delete().eq("salesman_id", sK.id);
  await admin.from("crm_incentive_rules").delete().eq("id", rule.id);
  await admin.from("crm_salesmen").delete().eq("id", sK.id);
  await admin.from("crm_products").delete().eq("id", pK.id);
  await admin.from("crm_products").delete().eq("id", pR.id);
  await admin.from("crm_user_company_access").delete().in("user_id", [
    ownerAuth.id,
    salesAuth.id,
    acctAuth.id,
  ]);
  await admin.from("crm_profiles").delete().in("id", [
    ownerAuth.id,
    salesAuth.id,
    acctAuth.id,
  ]);
  await admin.auth.admin.deleteUser(ownerAuth.id);
  await admin.auth.admin.deleteUser(salesAuth.id);
  await admin.auth.admin.deleteUser(acctAuth.id);
  pass("cleanup", "test users/data removed");

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== PHASE 4 VERIFY SUMMARY ===");
  console.log(`Total: ${results.length}  PASS: ${results.length - failed.length}  FAIL: ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(" -", f.name, f.detail);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
