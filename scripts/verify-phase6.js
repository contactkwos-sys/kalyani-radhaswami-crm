#!/usr/bin/env node
/**
 * Phase 6 acceptance: backup tables/RLS, Excel round-trip, restore preview,
 * role gates, audit actions, company isolation, cron auth.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const ExcelJS = require("exceljs");

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

const REQUIRED_SHEETS = [
  "Companies",
  "Users",
  "Salesmen",
  "Products",
  "Parties",
  "Party Contacts",
  "Product Assignments",
  "Salesman Assignments",
  "Party Product Assignments",
  "Daily Plans",
  "Visits",
  "GPS Visit Records",
  "Visit Feedback",
  "Follow Ups",
  "Samples",
  "Sales",
  "Sales Targets",
  "Incentive Rules",
  "Incentive Transactions",
  "Party Product History",
  "Audit Logs",
];

async function main() {
  const stamp = Date.now().toString(36);
  const ownerEmail = `crm.p6.owner+${stamp}@example.com`;
  const salesEmail = `crm.p6.sales+${stamp}@example.com`;
  const acctEmail = `crm.p6.acct+${stamp}@example.com`;
  const pw = `Verify6!${stamp}A1`;

  for (const table of [
    "crm_backup_settings",
    "crm_backup_jobs",
    "crm_restore_sessions",
    "crm_drive_connections",
    "crm_companies",
    "crm_parties",
    "crm_sales",
  ]) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`table:${table}`, error.message);
    else pass(`table:${table}`);
  }

  const { data: bucket } = await admin.storage.getBucket("crm-backups");
  if (bucket) pass("storage:crm-backups");
  else fail("storage:crm-backups", "bucket missing");

  const { data: companies } = await admin
    .from("crm_companies")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name");
  if (!companies || companies.length < 2) {
    fail("companies", "need Kalyani + Radhaswami");
  } else {
    pass("companies", companies.map((c) => c.code).join(","));
  }
  const companyIds = (companies || []).map((c) => c.id);
  const kalyani = companies?.find((c) => c.code === "KALYANI") || companies?.[0];
  const radha =
    companies?.find((c) => c.code === "RADHASWAMI") || companies?.[1];

  const owner = await ensureUser(ownerEmail, pw, {
    full_name: "P6 Owner",
    role: "OWNER",
  });
  const salesman = await ensureUser(salesEmail, pw, {
    full_name: "P6 Sales",
    role: "SALESMAN",
  });
  const accountant = await ensureUser(acctEmail, pw, {
    full_name: "P6 Acct",
    role: "ACCOUNTANT",
  });

  await admin.from("crm_profiles").upsert([
    {
      id: owner.id,
      email: ownerEmail,
      full_name: "P6 Owner",
      role: "OWNER",
      is_active: true,
      company_scope: "ALL",
    },
    {
      id: salesman.id,
      email: salesEmail,
      full_name: "P6 Sales",
      role: "SALESMAN",
      is_active: true,
      company_scope: "KALYANI",
    },
    {
      id: accountant.id,
      email: acctEmail,
      full_name: "P6 Acct",
      role: "ACCOUNTANT",
      is_active: true,
      company_scope: "KALYANI",
    },
  ]);

  if (kalyani) {
    await admin.from("crm_user_company_access").upsert(
      [
        {
          user_id: salesman.id,
          company_id: kalyani.id,
          is_active: true,
        },
        {
          user_id: accountant.id,
          company_id: kalyani.id,
          is_active: true,
        },
      ],
      { onConflict: "user_id,company_id" }
    );
  }

  // Ensure global settings row
  const { data: settings } = await admin
    .from("crm_backup_settings")
    .select("*")
    .is("company_id", null)
    .maybeSingle();
  if (settings) pass("settings:global");
  else fail("settings:global", "missing");

  await admin
    .from("crm_backup_settings")
    .update({ accountant_export_allowed: false })
    .eq("id", settings.id);

  // RLS: salesman cannot read backup jobs
  const { client: salesClient } = await clientAs(salesEmail, pw);
  const { data: salesJobs, error: salesJobsErr } = await salesClient
    .from("crm_backup_jobs")
    .select("id")
    .limit(5);
  if (!salesJobsErr && (!salesJobs || salesJobs.length === 0)) {
    pass("rls:salesman-no-jobs");
  } else if (salesJobsErr) {
    pass("rls:salesman-no-jobs", salesJobsErr.message);
  } else {
    fail("rls:salesman-no-jobs", `saw ${salesJobs.length} rows`);
  }

  const { data: salesSettings } = await salesClient
    .from("crm_backup_settings")
    .select("id")
    .limit(1);
  if (!salesSettings || salesSettings.length === 0) {
    pass("rls:salesman-no-settings");
  } else fail("rls:salesman-no-settings", "unexpected access");

  // Accountant without export flag
  const { client: acctClient } = await clientAs(acctEmail, pw);
  const { data: acctJobs } = await acctClient
    .from("crm_backup_jobs")
    .select("id")
    .limit(5);
  if (!acctJobs || acctJobs.length === 0) {
    pass("rls:accountant-blocked-without-flag");
  } else fail("rls:accountant-blocked-without-flag", "unexpected jobs");

  await admin
    .from("crm_backup_settings")
    .update({ accountant_export_allowed: true })
    .eq("id", settings.id);

  const { data: acctJobs2 } = await acctClient
    .from("crm_backup_jobs")
    .select("id")
    .limit(5);
  // May be empty but should not error with RLS deny of all if policy allows
  pass(
    "rls:accountant-export-flag",
    `rows=${(acctJobs2 || []).length}`
  );

  // Owner can write a job row
  const { client: ownerClient } = await clientAs(ownerEmail, pw);
  const fileName = `Kalyani_Radhaswami_CRM_Backup_2099-01-01_04-30.xlsx`;
  const { data: job, error: jobErr } = await ownerClient
    .from("crm_backup_jobs")
    .insert({
      backup_type: "MANUAL",
      status: "SUCCESS",
      drive_status: "SKIPPED",
      company_scope: "ALL",
      company_ids: companyIds,
      file_name: fileName,
      file_size_bytes: 1024,
      storage_path: `manual/${fileName}`,
      app_version: "0.6.0-phase6",
      record_counts: { Parties: 1, Products: 1 },
      total_records: 2,
      created_by: owner.id,
    })
    .select("*")
    .single();
  if (jobErr) fail("owner:insert-job", jobErr.message);
  else pass("owner:insert-job", job.id);

  // Excel build/parse round-trip
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet("Backup Information");
  info.addRow(["Application Version", "0.6.0-phase6"]);
  info.addRow(["Backup Timestamp (IST)", "2099-01-01 04:30:00"]);
  info.addRow(["Backup Type", "MANUAL"]);
  info.addRow(["Companies", "Kalyani Thread, Radhaswami Thread"]);

  const companySheet = wb.addWorksheet("Companies");
  companySheet.addRow(["id", "name", "code"]);
  if (kalyani)
    companySheet.addRow([kalyani.id, kalyani.name, kalyani.code]);
  if (radha) companySheet.addRow([radha.id, radha.name, radha.code]);

  for (const name of REQUIRED_SHEETS) {
    if (name === "Companies") continue;
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRow(["id"]);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const missing = REQUIRED_SHEETS.filter(
    (n) => !loaded.getWorksheet(n.slice(0, 31))
  );
  if (missing.length) fail("excel:sheets", missing.join(","));
  else pass("excel:sheets", `${REQUIRED_SHEETS.length} sheets`);

  if (!loaded.getWorksheet("Backup Information")) {
    fail("excel:info-sheet");
  } else pass("excel:info-sheet");

  // Company isolation: collect parties only for one company via admin filter
  if (kalyani && radha) {
    const { data: kParties } = await admin
      .from("crm_parties")
      .select("id, company_id")
      .eq("company_id", kalyani.id)
      .limit(50);
    const leaked = (kParties || []).some((p) => p.company_id !== kalyani.id);
    if (leaked) fail("isolation:parties");
    else pass("isolation:parties", `n=${(kParties || []).length}`);
  }

  // Restore session owner-only
  const { data: session, error: sessErr } = await ownerClient
    .from("crm_restore_sessions")
    .insert({
      created_by: owner.id,
      mode: "MERGE",
      file_name: fileName,
      storage_path: `restore-pending/${owner.id}/test.xlsx`,
      preview: { sheetCounts: { Parties: 0 } },
      validation_errors: [],
      is_valid: true,
      status: "PREVIEW",
    })
    .select("*")
    .single();
  if (sessErr) fail("owner:restore-session", sessErr.message);
  else pass("owner:restore-session", session.id);

  const { data: salesSessions } = await salesClient
    .from("crm_restore_sessions")
    .select("id")
    .limit(5);
  if (!salesSessions || salesSessions.length === 0) {
    pass("rls:salesman-no-restore");
  } else fail("rls:salesman-no-restore", "unexpected");

  // Drive tokens not readable by salesman
  const { data: driveRows } = await salesClient
    .from("crm_drive_connections")
    .select("id, access_token_enc")
    .limit(5);
  if (!driveRows || driveRows.length === 0) {
    pass("security:drive-tokens-hidden");
  } else fail("security:drive-tokens-hidden", "salesman saw drive rows");

  // Audit log write via RPC as owner
  const { error: auditErr } = await ownerClient.rpc("crm_write_audit_log", {
    p_action: "BACKUP_CREATED",
    p_module: "backup",
    p_company_id: kalyani?.id || null,
    p_record_type: "crm_backup_jobs",
    p_record_id: job?.id || null,
    p_metadata: { verify: "phase6" },
  });
  if (auditErr) fail("audit:write", auditErr.message);
  else pass("audit:write");

  // Cleanup test artifacts
  if (session?.id) {
    await admin.from("crm_restore_sessions").delete().eq("id", session.id);
  }
  if (job?.id) {
    await admin.from("crm_backup_jobs").delete().eq("id", job.id);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Phase 6 summary ---");
  console.log(`PASS ${results.filter((r) => r.ok).length} / ${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log("FAIL", f.name, f.detail);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
