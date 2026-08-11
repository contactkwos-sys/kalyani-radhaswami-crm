import { createServiceClient } from "@/lib/supabase/admin";
import {
  parseWorkbookBuffer,
  validateBackupWorkbook,
} from "@/lib/backup/excel";
import type { RestoreMode, RestorePreview } from "@/types/backup";

const UPSERT_ORDER: Array<{ sheet: string; table: string; onConflict: string }> = [
  { sheet: "Companies", table: "crm_companies", onConflict: "id" },
  { sheet: "Users", table: "crm_profiles", onConflict: "id" },
  { sheet: "Salesmen", table: "crm_salesmen", onConflict: "id" },
  { sheet: "Products", table: "crm_products", onConflict: "id" },
  { sheet: "Parties", table: "crm_parties", onConflict: "id" },
  { sheet: "Product Assignments", table: "crm_salesman_products", onConflict: "id" },
  { sheet: "Salesman Assignments", table: "crm_party_salesmen", onConflict: "id" },
  { sheet: "Party Product Assignments", table: "crm_party_products", onConflict: "id" },
  { sheet: "Daily Plans", table: "crm_daily_plans", onConflict: "id" },
  { sheet: "Visits", table: "crm_visits", onConflict: "id" },
  { sheet: "GPS Visit Records", table: "crm_visit_gps_logs", onConflict: "id" },
  { sheet: "Visit Feedback", table: "crm_visit_feedback", onConflict: "id" },
  { sheet: "Follow Ups", table: "crm_followups", onConflict: "id" },
  { sheet: "Samples", table: "crm_samples", onConflict: "id" },
  { sheet: "Sales", table: "crm_sales", onConflict: "id" },
  { sheet: "Sales Targets", table: "crm_salesman_targets", onConflict: "id" },
  { sheet: "Incentive Rules", table: "crm_incentive_rules", onConflict: "id" },
  { sheet: "Incentive Transactions", table: "crm_incentive_calculations", onConflict: "id" },
  { sheet: "Party Product History", table: "crm_party_product_history", onConflict: "id" },
];

const FULL_DELETE_ORDER = [
  "crm_incentive_calculations",
  "crm_party_product_history",
  "crm_sales",
  "crm_samples",
  "crm_followups",
  "crm_visit_feedback",
  "crm_visit_gps_logs",
  "crm_visits",
  "crm_planned_visits",
  "crm_daily_plans",
  "crm_party_products",
  "crm_party_salesmen",
  "crm_salesman_products",
  "crm_salesman_targets",
  "crm_incentive_rules",
  "crm_parties",
  "crm_products",
  "crm_salesmen",
];

function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue;
    if (v === "") {
      out[k] = null;
      continue;
    }
    out[k] = v;
  }
  return out;
}

export async function buildRestorePreview(
  buffer: Buffer
): Promise<{ preview: RestorePreview; sheets: Record<string, Record<string, unknown>[]>; info: Record<string, string> }> {
  const parsed = await parseWorkbookBuffer(buffer);
  const validation = validateBackupWorkbook(parsed);
  const admin = createServiceClient();

  let newRecords = 0;
  let existingRecords = 0;
  let changedRecords = 0;
  let invalidRecords = 0;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  for (const step of UPSERT_ORDER) {
    const rows = parsed.sheets[step.sheet] || [];
    const ids = rows
      .map((r) => (r.id != null ? String(r.id) : ""))
      .filter(Boolean);
    invalidRecords += rows.length - ids.length;
    if (!ids.length) continue;

    const existingIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data: existing } = await admin
        .from(step.table)
        .select("id")
        .in("id", chunk);
      for (const e of existing || []) existingIds.add(String(e.id));
    }
    existingRecords += existingIds.size;
    changedRecords += existingIds.size;
    newRecords += ids.length - existingIds.size;
  }

  if (!validation.ok) {
    invalidRecords = Math.max(invalidRecords, validation.errors.length);
  }

  return {
    info: parsed.info,
    sheets: parsed.sheets,
    preview: {
      sheetCounts: parsed.counts,
      newRecords,
      existingRecords,
      changedRecords,
      invalidRecords,
      errors,
      warnings,
    },
  };
}

async function deleteCompanyScoped(companyIds: string[]) {
  const admin = createServiceClient();
  for (const table of FULL_DELETE_ORDER) {
    const { error } = await admin.from(table).delete().in("company_id", companyIds);
    if (error) {
      // some tables may not exist in older envs — surface clearly
      throw new Error(`Safety clear failed on ${table}: ${error.message}`);
    }
  }
}

export async function executeRestore(opts: {
  mode: RestoreMode;
  sheets: Record<string, Record<string, unknown>[]>;
  companyIds: string[];
}): Promise<{ imported: Record<string, number> }> {
  const admin = createServiceClient();
  const imported: Record<string, number> = {};

  if (opts.mode === "FULL") {
    if (!opts.companyIds.length) {
      throw new Error("Full restore requires company scope from the backup file.");
    }
    await deleteCompanyScoped(opts.companyIds);
  }

  for (const step of UPSERT_ORDER) {
    if (step.sheet === "Users" && opts.mode === "FULL") {
      // Never delete/recreate auth users — merge profile rows only
    }
    if (step.sheet === "Companies" && opts.mode === "FULL") {
      // Keep company master rows; upsert only
    }

    const rows = (opts.sheets[step.sheet] || []).map(cleanRow);
    if (!rows.length) {
      imported[step.sheet] = 0;
      continue;
    }

    // chunk upserts
    const chunkSize = 200;
    let count = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await admin.from(step.table).upsert(chunk, {
        onConflict: step.onConflict,
        ignoreDuplicates: false,
      });
      if (error) {
        throw new Error(`Restore failed on ${step.sheet}: ${error.message}`);
      }
      count += chunk.length;
    }
    imported[step.sheet] = count;
  }

  return { imported };
}

export function companyIdsFromSheets(
  sheets: Record<string, Record<string, unknown>[]>
): string[] {
  return [
    ...new Set(
      (sheets["Companies"] || [])
        .map((c) => String(c.id || ""))
        .filter(Boolean)
    ),
  ];
}
