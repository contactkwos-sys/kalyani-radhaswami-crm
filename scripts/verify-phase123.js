#!/usr/bin/env node
/**
 * End-to-end verification for Phase 1–3.
 * Loads .env.local, exercises auth/RLS/CRUD/GPS/visits, then cleans up.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
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

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ixulyhomqtajenigopai.supabase.co";
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
  const ownerEmail = `crm.owner.verify+${stamp}@example.com`;
  const salesmanEmail = `crm.sales.verify+${stamp}@example.com`;
  const viewerEmail = `crm.viewer.verify+${stamp}@example.com`;
  const pw = `Verify!${stamp}A1`;

  const { data: companies, error: cErr } = await admin
    .from("crm_companies")
    .select("*");
  if (cErr) throw cErr;
  const kalyani = companies.find((c) => c.code === "KALYANI");
  const radha = companies.find((c) => c.code === "RADHASWAMI");
  if (!kalyani || !radha) throw new Error("companies missing");
  pass("companies.seed", `${kalyani.name} / ${radha.name}`);

  const ownerAuth = await ensureUser(ownerEmail, pw, {
    app: "crm",
    crm: "true",
    role: "OWNER",
    full_name: "Verify Owner",
  });
  const salesAuth = await ensureUser(salesmanEmail, pw, {
    app: "crm",
    crm: "true",
    role: "SALESMAN",
    full_name: "Verify Salesman",
  });
  const viewerAuth = await ensureUser(viewerEmail, pw, {
    app: "crm",
    crm: "true",
    role: "VIEWER",
    full_name: "Verify Viewer",
  });

  for (const [u, role, scope] of [
    [ownerAuth, "OWNER", "ALL"],
    [salesAuth, "SALESMAN", "KALYANI"],
    [viewerAuth, "VIEWER", "KALYANI"],
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
  pass("auth.profiles", "owner/salesman/viewer created");

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
        user_id: viewerAuth.id,
        company_id: kalyani.id,
        role: "VIEWER",
        is_active: true,
      },
    ],
    { onConflict: "user_id,company_id" }
  );
  pass("auth.company_access", "scoped access set");

  const pin = "482913";
  const hash = await bcrypt.hash(pin, 12);
  await admin
    .from("crm_owner_security")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  const { error: pinIns } = await admin
    .from("crm_owner_security")
    .insert({ pin_hash: hash, pin_version: 1 });
  if (pinIns) throw pinIns;
  if (await bcrypt.compare(pin, hash)) pass("security.pin_hash", "bcrypt verify ok");
  else fail("security.pin_hash", "bcrypt mismatch");

  const ownerSess = await clientAs(ownerEmail, pw);
  pass("auth.login.owner", ownerSess.user.id);
  const salesSess = await clientAs(salesmanEmail, pw);
  pass("auth.login.salesman", salesSess.user.id);
  const viewerSess = await clientAs(viewerEmail, pw);
  pass("auth.login.viewer", viewerSess.user.id);

  {
    const { error } = await viewerSess.client.from("crm_products").insert({
      company_id: kalyani.id,
      product_code: "V-DENY",
      product_name: "Should Fail",
      unit: "KG",
      sales_rate: 1,
    });
    if (error) pass("rls.viewer_cannot_create_product", error.message);
    else fail("rls.viewer_cannot_create_product", "insert unexpectedly succeeded");
  }

  const { data: pK, error: pKErr } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: kalyani.id,
      product_code: `PK-${stamp}`,
      product_name: "Kalyani Yarn A",
      category: "Yarn",
      unit: "KG",
      sales_rate: 250,
      monthly_target: 100000,
      incentive_percent: 1.5,
      status: "ACTIVE",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (pKErr) fail("crud.product.kalyani", pKErr.message);
  else pass("crud.product.kalyani", pK.id);

  const { data: pR, error: pRErr } = await ownerSess.client
    .from("crm_products")
    .insert({
      company_id: radha.id,
      product_code: `PR-${stamp}`,
      product_name: "Radha Yarn B",
      category: "Yarn",
      unit: "KG",
      sales_rate: 280,
      monthly_target: 120000,
      incentive_percent: 2,
      status: "ACTIVE",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (pRErr) fail("crud.product.radhaswami", pRErr.message);
  else pass("crud.product.radhaswami", pR.id);

  const { data: sK, error: sKErr } = await ownerSess.client
    .from("crm_salesmen")
    .insert({
      company_id: kalyani.id,
      employee_id: `EK-${stamp}`,
      name: "Rajesh Verify",
      mobile: "9000000001",
      monthly_target: 500000,
      status: "ACTIVE",
      user_id: salesAuth.id,
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (sKErr) fail("crud.salesman.kalyani", sKErr.message);
  else pass("crud.salesman.kalyani", sK.id);

  const { data: sR, error: sRErr } = await ownerSess.client
    .from("crm_salesmen")
    .insert({
      company_id: radha.id,
      employee_id: `ER-${stamp}`,
      name: "Suresh Radha",
      mobile: "9000000002",
      monthly_target: 400000,
      status: "ACTIVE",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (sRErr) fail("crud.salesman.radhaswami", sRErr.message);
  else pass("crud.salesman.radhaswami", sR.id);

  const partyLat = 21.1702;
  const partyLng = 72.8311;
  const { data: partyK, error: partyKErr } = await ownerSess.client
    .from("crm_parties")
    .insert({
      company_id: kalyani.id,
      party_code: `BK-${stamp}`,
      party_name: "Balaji Textile Verify",
      contact_person: "Purchase",
      mobile: "9800000001",
      area: "Ring Road",
      city: "Surat",
      latitude: partyLat,
      longitude: partyLng,
      potential_monthly_business: 300000,
      status: "PROSPECT",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (partyKErr) fail("crud.party.kalyani", partyKErr.message);
  else pass("crud.party.kalyani", partyK.id);

  const { data: partyR, error: partyRErr } = await ownerSess.client
    .from("crm_parties")
    .insert({
      company_id: radha.id,
      party_code: `BR-${stamp}`,
      party_name: "Radha Mills Verify",
      contact_person: "Owner",
      city: "Surat",
      latitude: partyLat,
      longitude: partyLng,
      potential_monthly_business: 200000,
      status: "NEW",
      created_by: ownerAuth.id,
    })
    .select("*")
    .single();
  if (partyRErr) fail("crud.party.radhaswami", partyRErr.message);
  else pass("crud.party.radhaswami", partyR.id);

  {
    const { data, error } = await ownerSess.client
      .from("crm_products")
      .update({ sales_rate: 255 })
      .eq("id", pK.id)
      .select("sales_rate")
      .single();
    if (!error && Number(data.sales_rate) === 255) pass("crud.product.update", "rate=255");
    else fail("crud.product.update", error?.message || JSON.stringify(data));
  }

  const { data: sp, error: spErr } = await ownerSess.client
    .from("crm_salesman_products")
    .upsert(
      {
        company_id: kalyani.id,
        salesman_id: sK.id,
        product_id: pK.id,
        is_active: true,
        assigned_by: ownerAuth.id,
      },
      { onConflict: "salesman_id,product_id" }
    )
    .select("*")
    .single();
  if (spErr) fail("assign.salesman_product", spErr.message);
  else pass("assign.salesman_product", sp.id);

  const { error: psErr } = await ownerSess.client
    .from("crm_party_salesmen")
    .upsert(
      {
        company_id: kalyani.id,
        party_id: partyK.id,
        salesman_id: sK.id,
        product_id: pK.id,
        is_active: true,
        assigned_by: ownerAuth.id,
      },
      { onConflict: "party_id,salesman_id,product_id" }
    )
    .select("*")
    .single();
  if (psErr) fail("assign.party_salesman_product", psErr.message);
  else pass("assign.party_salesman_product", "ok");

  const { error: ppErr } = await ownerSess.client
    .from("crm_party_products")
    .upsert(
      {
        company_id: kalyani.id,
        party_id: partyK.id,
        product_id: pK.id,
        relation_type: "INTERESTED",
        is_active: true,
        assigned_by: ownerAuth.id,
      },
      { onConflict: "party_id,product_id,relation_type" }
    )
    .select("*")
    .single();
  if (ppErr) fail("assign.party_product", ppErr.message);
  else pass("assign.party_product", "ok");

  {
    const { data: radhaParties } = await salesSess.client
      .from("crm_parties")
      .select("id")
      .eq("id", partyR.id);
    if ((radhaParties || []).length === 0)
      pass("isolation.salesman_no_radha_party", "hidden");
    else fail("isolation.salesman_no_radha_party", "visible");

    const { data: radhaProducts } = await salesSess.client
      .from("crm_products")
      .select("id")
      .eq("id", pR.id);
    if ((radhaProducts || []).length === 0)
      pass("isolation.salesman_no_radha_product", "hidden");
    else fail("isolation.salesman_no_radha_product", "visible");

    const { data: ownParties } = await salesSess.client
      .from("crm_parties")
      .select("id")
      .eq("id", partyK.id);
    if ((ownParties || []).length === 1)
      pass("isolation.salesman_sees_assigned_party", partyK.id);
    else fail("isolation.salesman_sees_assigned_party", "missing");
  }

  const planDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const { data: plan, error: planErr } = await salesSess.client
    .from("crm_daily_plans")
    .upsert(
      {
        company_id: kalyani.id,
        salesman_id: sK.id,
        plan_date: planDate,
        daily_sales_target: 150000,
        planned_parties_count: 1,
        status: "PLANNED",
        created_by: salesAuth.id,
      },
      { onConflict: "salesman_id,plan_date" }
    )
    .select("*")
    .single();
  if (planErr) fail("daily_plan.create", planErr.message);
  else pass("daily_plan.create", plan.id);

  const { data: pv, error: pvErr } = await salesSess.client
    .from("crm_planned_visits")
    .upsert(
      {
        company_id: kalyani.id,
        daily_plan_id: plan.id,
        party_id: partyK.id,
        product_id: pK.id,
        sequence_no: 1,
        status: "PLANNED",
      },
      { onConflict: "daily_plan_id,party_id,product_id" }
    )
    .select("*")
    .single();
  if (pvErr) fail("daily_plan.planned_visit", pvErr.message);
  else pass("daily_plan.planned_visit", pv.id);

  {
    const { data, error } = await salesSess.client.rpc("crm_start_visit", {
      p_party_id: partyK.id,
      p_salesman_id: sK.id,
      p_latitude: 28.6139,
      p_longitude: 77.209,
      p_accuracy_meters: 10,
      p_product_id: pK.id,
      p_planned_visit_id: null,
      p_client_reported_at: new Date().toISOString(),
    });
    if (error) fail("gps.reject_out_of_range", error.message);
    else {
      const visit = Array.isArray(data) ? data[0] : data;
      if (
        visit.gps_verified === false &&
        visit.status === "REJECTED_GPS" &&
        /not within/i.test(visit.rejection_reason || "")
      ) {
        pass(
          "gps.reject_out_of_range",
          `distance=${visit.start_distance_meters}`
        );
      } else fail("gps.reject_out_of_range", JSON.stringify(visit));
    }
  }

  let visit1;
  {
    const { data, error } = await salesSess.client.rpc("crm_start_visit", {
      p_party_id: partyK.id,
      p_salesman_id: sK.id,
      p_latitude: partyLat + 0.00035,
      p_longitude: partyLng,
      p_accuracy_meters: 8,
      p_product_id: pK.id,
      p_planned_visit_id: pv.id,
      p_client_reported_at: new Date().toISOString(),
    });
    if (error) fail("gps.verify_start", error.message);
    else {
      visit1 = Array.isArray(data) ? data[0] : data;
      if (
        visit1.gps_verified &&
        visit1.status === "STARTED" &&
        visit1.start_at &&
        Number(visit1.start_distance_meters) <= 200
      ) {
        pass("gps.verify_start", `distance=${visit1.start_distance_meters}m`);
      } else fail("gps.verify_start", JSON.stringify(visit1));
    }
  }

  if (visit1) {
    const { error } = await admin
      .from("crm_visits")
      .update({ start_at: "2020-01-01T00:00:00Z" })
      .eq("id", visit1.id);
    if (error && /cannot be modified/i.test(error.message))
      pass("visit.immutable_start_at", error.message);
    else if (error) pass("visit.immutable_start_at", "blocked: " + error.message);
    else fail("visit.immutable_start_at", "start_at was overwritten");
  }

  let ended1;
  if (visit1) {
    await new Promise((r) => setTimeout(r, 1200));
    const { data, error } = await salesSess.client.rpc("crm_end_visit", {
      p_visit_id: visit1.id,
      p_latitude: partyLat + 0.0002,
      p_longitude: partyLng,
      p_accuracy_meters: 12,
      p_client_reported_at: new Date().toISOString(),
    });
    if (error) fail("visit.end_timer", error.message);
    else {
      ended1 = Array.isArray(data) ? data[0] : data;
      if (
        ended1.status === "ENDED" &&
        ended1.end_at &&
        ended1.duration_seconds != null &&
        ended1.duration_seconds >= 1
      ) {
        pass("visit.end_timer", `duration_seconds=${ended1.duration_seconds}`);
      } else fail("visit.end_timer", JSON.stringify(ended1));
    }
  }

  let visit2;
  {
    const { data, error } = await salesSess.client.rpc("crm_start_visit", {
      p_party_id: partyK.id,
      p_salesman_id: sK.id,
      p_latitude: partyLat + 0.0001,
      p_longitude: partyLng,
      p_accuracy_meters: 5,
      p_product_id: pK.id,
      p_client_reported_at: new Date().toISOString(),
    });
    if (error) fail("visit.multiple_same_day.start2", error.message);
    else {
      visit2 = Array.isArray(data) ? data[0] : data;
      if (visit2.id !== visit1.id && visit2.gps_verified)
        pass("visit.multiple_same_day.start2", visit2.id);
      else fail("visit.multiple_same_day.start2", JSON.stringify(visit2));
    }
  }
  if (visit2) {
    const { data, error } = await salesSess.client.rpc("crm_end_visit", {
      p_visit_id: visit2.id,
      p_latitude: partyLat,
      p_longitude: partyLng,
      p_accuracy_meters: 5,
    });
    if (error) fail("visit.multiple_same_day.end2", error.message);
    else
      pass(
        "visit.multiple_same_day.end2",
        (Array.isArray(data) ? data[0] : data).id
      );

    const { data: allToday } = await admin
      .from("crm_visits")
      .select("id,status,gps_verified")
      .eq("party_id", partyK.id)
      .eq("visit_date", planDate)
      .eq("gps_verified", true);
    const ended = (allToday || []).filter((v) => v.status === "ENDED");
    if (ended.length >= 2)
      pass("visit.multiple_same_day.retained", `ended_count=${ended.length}`);
    else fail("visit.multiple_same_day.retained", JSON.stringify(allToday));
  }

  if (ended1) {
    const followDate = new Date(Date.now() + 86400000).toLocaleDateString(
      "en-CA",
      { timeZone: "Asia/Kolkata" }
    );
    const { error: fbErr } = await salesSess.client
      .from("crm_visit_feedback")
      .upsert(
        {
          company_id: kalyani.id,
          visit_id: ended1.id,
          person_met: "Rajesh",
          designation: "Purchase",
          discussion: "Rate discussion and sample request",
          product_id: pK.id,
          potential_monthly_business: 300000,
          sample_required: true,
          sample_given: true,
          trial_required: true,
          trial_date: followDate,
          probability: "P50",
          remarks: "Follow next week",
        },
        { onConflict: "visit_id" }
      );
    if (fbErr) fail("feedback.save", fbErr.message);
    else pass("feedback.save", ended1.id);

    const { error: sampleErr } = await salesSess.client
      .from("crm_samples")
      .insert({
        company_id: kalyani.id,
        party_id: partyK.id,
        salesman_id: sK.id,
        product_id: pK.id,
        visit_id: ended1.id,
        quantity: 1,
      });
    if (sampleErr) fail("feedback.sample", sampleErr.message);
    else pass("feedback.sample", "created");

    const { error: fuErr } = await salesSess.client.from("crm_followups").insert({
      company_id: kalyani.id,
      party_id: partyK.id,
      salesman_id: sK.id,
      visit_id: ended1.id,
      followup_date: followDate,
      purpose: "Trial follow-up",
      priority: "HIGH",
      created_by: salesAuth.id,
    });
    if (fuErr) fail("followup.create", fuErr.message);
    else pass("followup.create", followDate);

    const { data: fus } = await salesSess.client
      .from("crm_followups")
      .select("*")
      .eq("visit_id", ended1.id);
    if ((fus || []).length >= 1) pass("followup.visible_to_salesman", fus[0].id);
    else fail("followup.visible_to_salesman", "none");
  }

  {
    const { data, error } = await ownerSess.client
      .from("crm_owner_security")
      .select("*");
    if ((data || []).length === 0)
      pass("security.pin_not_exposed_via_rls", error?.message || "empty");
    else fail("security.pin_not_exposed_via_rls", "PIN row visible to client");
  }

  {
    const { data, error } = await admin.rpc("crm_get_license_for_company", {
      p_company_id: kalyani.id,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row && row.can_operate && row.trial_remaining_seconds > 0) {
      pass(
        "license.server_status",
        `${row.status} remaining=${row.trial_remaining_seconds}`
      );
    } else fail("license.server_status", error?.message || JSON.stringify(row));
  }

  {
    const { data } = await admin
      .from("crm_planned_visits")
      .select("status")
      .eq("id", pv.id)
      .single();
    if (data?.status === "COMPLETED")
      pass("daily_plan.completed_on_visit", data.status);
    else fail("daily_plan.completed_on_visit", JSON.stringify(data));
  }

  {
    const { data } = await admin
      .from("crm_visit_gps_logs")
      .select("event_type")
      .eq("visit_id", visit1.id);
    const types = (data || []).map((d) => d.event_type);
    if (types.includes("START_VERIFIED") && types.includes("END"))
      pass("gps.logs", types.join(","));
    else fail("gps.logs", types.join(","));
  }

  const mw = fs.readFileSync(
    path.join(__dirname, "..", "src/middleware.ts"),
    "utf8"
  );
  const mwLib = fs.readFileSync(
    path.join(__dirname, "..", "src/lib/supabase/middleware.ts"),
    "utf8"
  );
  if (
    mw.includes("updateSession") &&
    mwLib.includes("/login") &&
    mwLib.includes("getUser")
  ) {
    pass("auth.middleware_protects_routes", "present");
  } else fail("auth.middleware_protects_routes", "missing checks");

  // Cleanup
  for (const u of [ownerAuth, salesAuth, viewerAuth]) {
    await admin.auth.admin.deleteUser(u.id);
  }
  if (partyK?.id) {
    const { data: vids } = await admin
      .from("crm_visits")
      .select("id")
      .eq("party_id", partyK.id);
    for (const v of vids || []) {
      await admin.from("crm_visit_feedback").delete().eq("visit_id", v.id);
      await admin.from("crm_visit_gps_logs").delete().eq("visit_id", v.id);
      await admin.from("crm_followups").delete().eq("visit_id", v.id);
      await admin.from("crm_samples").delete().eq("visit_id", v.id);
      await admin.from("crm_trials").delete().eq("visit_id", v.id);
    }
    await admin.from("crm_visits").delete().eq("party_id", partyK.id);
    await admin.from("crm_planned_visits").delete().eq("party_id", partyK.id);
    await admin.from("crm_party_salesmen").delete().eq("party_id", partyK.id);
    await admin.from("crm_party_products").delete().eq("party_id", partyK.id);
    await admin.from("crm_parties").delete().eq("id", partyK.id);
  }
  if (partyR?.id) await admin.from("crm_parties").delete().eq("id", partyR.id);
  if (plan?.id) {
    await admin.from("crm_planned_visits").delete().eq("daily_plan_id", plan.id);
    await admin.from("crm_daily_plans").delete().eq("id", plan.id);
  }
  if (sp?.id) await admin.from("crm_salesman_products").delete().eq("id", sp.id);
  if (sK?.id) await admin.from("crm_salesmen").delete().eq("id", sK.id);
  if (sR?.id) await admin.from("crm_salesmen").delete().eq("id", sR.id);
  if (pK?.id) await admin.from("crm_products").delete().eq("id", pK.id);
  if (pR?.id) await admin.from("crm_products").delete().eq("id", pR.id);

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  console.log(
    `passed=${results.filter((r) => r.ok).length} failed=${failed.length}`
  );
  if (failed.length) {
    for (const f of failed) console.log(" -", f.name, "::", f.detail);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
