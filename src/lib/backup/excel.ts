import ExcelJS from "exceljs";
import { APP_VERSION, BACKUP_SHEETS } from "@/types/backup";
import type { CollectedBackup } from "@/lib/backup/collect";

function stampParts(d = new Date()) {
  const iso = d.toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });
  // sv-SE => YYYY-MM-DD HH:mm:ss
  const [date, time] = iso.split(" ");
  const hhmm = (time || "00:00:00").slice(0, 5).replace(":", "-");
  return { date, time: time || "00:00:00", hhmm, iso };
}

export function buildBackupFileName(
  companyNames: string[],
  when = new Date()
): string {
  const { date, hhmm } = stampParts(when);
  const label =
    companyNames.length === 0
      ? "CRM"
      : companyNames
          .map((n) => n.replace(/\s+/g, "_"))
          .join("_")
          .slice(0, 80);
  return `${label}_CRM_Backup_${date}_${hhmm}.xlsx`;
}

function flattenValue(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "object") {
    if (Array.isArray(v)) return JSON.stringify(v);
    return JSON.stringify(v);
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return v;
  }
  return String(v);
}

export async function buildWorkbookBuffer(
  data: CollectedBackup,
  opts: {
    backupType: string;
    createdBy?: string | null;
  }
): Promise<{ buffer: Buffer; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kalyani Radhaswami CRM";
  wb.created = new Date();

  const { iso } = stampParts();
  const info = wb.addWorksheet("Backup Information");
  const infoRows: Array<[string, string | number]> = [
    ["Application", "Kalyani Thread / Radhaswami Thread CRM"],
    ["Application Version", APP_VERSION],
    ["Backup Timestamp (IST)", iso],
    ["Backup Type", opts.backupType],
    ["Companies", data.companyNames.join(", ")],
    ["Company IDs", data.companyIds.join(", ")],
    ["Created By", opts.createdBy || ""],
    ["Total Records", data.totalRecords],
  ];
  for (const [k, v] of infoRows) {
    info.addRow([k, v]);
  }
  info.addRow([]);
  info.addRow(["Sheet", "Record Count"]);
  for (const def of BACKUP_SHEETS) {
    info.addRow([def.sheet, data.counts[def.sheet] || 0]);
  }
  info.getColumn(1).width = 28;
  info.getColumn(2).width = 60;

  for (const def of BACKUP_SHEETS) {
    const rows = data.sheets[def.sheet] || [];
    const ws = wb.addWorksheet(def.sheet.slice(0, 31));
    if (rows.length === 0) {
      ws.addRow(["id"]);
      continue;
    }
    const keys = Object.keys(rows[0]);
    // ensure id first when present
    const ordered = keys.includes("id")
      ? ["id", ...keys.filter((k) => k !== "id")]
      : keys;
    ws.addRow(ordered);
    for (const row of rows) {
      ws.addRow(ordered.map((k) => flattenValue(row[k])));
    }
    ws.getRow(1).font = { bold: true };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    fileName: buildBackupFileName(data.companyNames),
  };
}

export async function parseWorkbookBuffer(
  buffer: Buffer
): Promise<{
  info: Record<string, string>;
  sheets: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const info: Record<string, string> = {};
  const infoSheet = wb.getWorksheet("Backup Information");
  if (infoSheet) {
    infoSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 20) return;
      const k = String(row.getCell(1).value || "");
      const v = String(row.getCell(2).value || "");
      if (k) info[k] = v;
    });
  }

  const sheets: Record<string, Record<string, unknown>[]> = {};
  const counts: Record<string, number> = {};

  for (const def of BACKUP_SHEETS) {
    const ws = wb.getWorksheet(def.sheet.slice(0, 31));
    if (!ws) {
      sheets[def.sheet] = [];
      counts[def.sheet] = 0;
      continue;
    }
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col - 1] = String(cell.value || "").trim();
    });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, unknown> = {};
      let empty = true;
      headers.forEach((h, idx) => {
        if (!h) return;
        let val: unknown = row.getCell(idx + 1).value;
        if (val && typeof val === "object" && "text" in (val as object)) {
          val = (val as { text: string }).text;
        }
        if (val && typeof val === "object" && "result" in (val as object)) {
          val = (val as { result: unknown }).result;
        }
        if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
          try {
            val = JSON.parse(val);
          } catch {
            /* keep string */
          }
        }
        obj[h] = val ?? null;
        if (val != null && val !== "") empty = false;
      });
      if (!empty) rows.push(obj);
    });
    sheets[def.sheet] = rows;
    counts[def.sheet] = rows.length;
  }

  return { info, sheets, counts };
}

export function validateBackupWorkbook(parsed: {
  info: Record<string, string>;
  sheets: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
}): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed.info["Application Version"] && !parsed.info["Backup Timestamp (IST)"]) {
    warnings.push("Backup Information sheet missing metadata fields.");
  }

  for (const required of ["Companies", "Parties", "Products", "Salesmen"]) {
    if (!(required in parsed.sheets)) {
      errors.push(`Missing required sheet: ${required}`);
    }
  }

  const companies = parsed.sheets["Companies"] || [];
  for (const c of companies) {
    if (!c.id) errors.push("Company row missing id");
  }

  for (const sheet of ["Parties", "Products", "Salesmen", "Sales", "Visits"]) {
    for (const row of parsed.sheets[sheet] || []) {
      if (!row.id) {
        errors.push(`${sheet}: row missing unique id`);
        break;
      }
    }
  }

  // Relationship checks (sample)
  const partyIds = new Set(
    (parsed.sheets["Parties"] || []).map((p) => String(p.id))
  );
  for (const s of parsed.sheets["Sales"] || []) {
    if (s.party_id && !partyIds.has(String(s.party_id))) {
      warnings.push(`Sale ${s.id} references unknown party ${s.party_id}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
