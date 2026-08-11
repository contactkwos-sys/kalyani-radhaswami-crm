import { createServiceClient } from "@/lib/supabase/admin";
import { BACKUP_SHEETS, type SheetDef } from "@/types/backup";

export type CollectedBackup = {
  sheets: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
  totalRecords: number;
  companyIds: string[];
  companyNames: string[];
};

const PAGE = 1000;

async function fetchAll(
  table: string,
  companyIds: string[],
  companyColumn: string | null | undefined,
  orderBy?: string
): Promise<Record<string, unknown>[]> {
  const admin = createServiceClient();
  const rows: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    let q = admin.from(table).select("*").range(from, from + PAGE - 1);
    if (companyColumn === "id") {
      q = q.in("id", companyIds);
    } else if (companyColumn) {
      q = q.in(companyColumn, companyIds);
    }
    if (orderBy) q = q.order(orderBy, { ascending: true });

    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data || []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function partyContacts(parties: Record<string, unknown>[]) {
  return parties.map((p) => ({
    id: p.id,
    company_id: p.company_id,
    party_id: p.id,
    party_code: p.party_code,
    party_name: p.party_name,
    contact_person: p.contact_person,
    mobile: p.mobile,
    whatsapp: p.whatsapp,
    address: p.address,
    area: p.area,
    city: p.city,
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}

function filterUsers(
  users: Record<string, unknown>[],
  companyIds: string[],
  accessRows: Record<string, unknown>[]
) {
  const allowed = new Set(
    accessRows
      .filter((a) => companyIds.includes(String(a.company_id)))
      .map((a) => String(a.user_id))
  );
  // Always include owners
  return users.filter(
    (u) => u.role === "OWNER" || allowed.has(String(u.id))
  );
}

export async function collectBackupData(
  companyIds: string[]
): Promise<CollectedBackup> {
  if (!companyIds.length) throw new Error("No companies selected for backup.");

  const admin = createServiceClient();
  const { data: companies, error: cErr } = await admin
    .from("crm_companies")
    .select("id, name, code")
    .in("id", companyIds)
    .order("name");
  if (cErr) throw new Error(cErr.message);

  const { data: access } = await admin
    .from("crm_user_company_access")
    .select("*")
    .in("company_id", companyIds);

  const sheets: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  for (const def of BACKUP_SHEETS) {
    if (def.sheet === "Party Contacts") {
      // filled after Parties
      continue;
    }
    if (def.sheet === "Users") {
      const users = await fetchAll("crm_profiles", companyIds, null, "email");
      sheets[def.sheet] = filterUsers(users, companyIds, access || []);
      counts[def.sheet] = sheets[def.sheet].length;
      continue;
    }
    if (def.sheet === "Companies") {
      sheets[def.sheet] = await fetchAll(
        def.table,
        companyIds,
        "id",
        def.orderBy
      );
      counts[def.sheet] = sheets[def.sheet].length;
      continue;
    }
    if (def.sheet === "Audit Logs") {
      // company_id can be null on some logs — include company-scoped + null for selected owners
      const rows = await fetchAll(def.table, companyIds, "company_id", "created_at");
      sheets[def.sheet] = rows;
      counts[def.sheet] = rows.length;
      continue;
    }

    const rows = await fetchAll(
      def.table,
      companyIds,
      def.companyColumn,
      def.orderBy
    );
    sheets[def.sheet] = rows;
    counts[def.sheet] = rows.length;
  }

  sheets["Party Contacts"] = partyContacts(sheets["Parties"] || []);
  counts["Party Contacts"] = sheets["Party Contacts"].length;

  // Ensure sheet order completeness
  for (const def of BACKUP_SHEETS) {
    if (!sheets[def.sheet]) {
      sheets[def.sheet] = [];
      counts[def.sheet] = 0;
    }
  }

  const totalRecords = Object.values(counts).reduce((a, n) => a + n, 0);

  return {
    sheets,
    counts,
    totalRecords,
    companyIds,
    companyNames: (companies || []).map((c) => c.name),
  };
}

export function moduleSheetMap(module: string): SheetDef[] {
  const map: Record<string, string[]> = {
    parties: ["Parties", "Party Contacts", "Party Product Assignments", "Salesman Assignments"],
    products: ["Products", "Product Assignments", "Party Product Assignments"],
    salesmen: ["Salesmen", "Product Assignments", "Salesman Assignments"],
    visits: ["Visits", "GPS Visit Records", "Visit Feedback"],
    gps: ["GPS Visit Records", "Visits"],
    followups: ["Follow Ups"],
    sales: ["Sales"],
    incentives: ["Incentive Rules", "Incentive Transactions"],
    targets: ["Sales Targets"],
    party360: [
      "Parties",
      "Party Contacts",
      "Party Product Assignments",
      "Salesman Assignments",
      "Visits",
      "GPS Visit Records",
      "Visit Feedback",
      "Follow Ups",
      "Samples",
      "Sales",
      "Party Product History",
    ],
  };
  const names = map[module];
  if (!names) throw new Error("Unknown export module");
  return BACKUP_SHEETS.filter((s) => names.includes(s.sheet));
}

export async function collectModuleData(
  module: string,
  companyIds: string[],
  dateFrom?: string,
  dateTo?: string
): Promise<CollectedBackup> {
  const full = await collectBackupData(companyIds);
  const defs = moduleSheetMap(module);
  const sheets: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  for (const def of defs) {
    let rows = full.sheets[def.sheet] || [];
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const d = String(
          r.sale_date || r.visit_date || r.followup_date || r.plan_date || r.created_at || ""
        ).slice(0, 10);
        if (!d) return true;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    }
    sheets[def.sheet] = rows;
    counts[def.sheet] = rows.length;
  }

  return {
    sheets,
    counts,
    totalRecords: Object.values(counts).reduce((a, n) => a + n, 0),
    companyIds: full.companyIds,
    companyNames: full.companyNames,
  };
}
