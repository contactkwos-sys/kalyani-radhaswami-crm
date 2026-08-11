import type { ReportFilters } from "@/types/intelligence";

/** Indian FY: Apr 1 – Mar 31 */
export function financialYearRange(fyLabel: string): { from: string; to: string } {
  const startYear = Number(fyLabel.split("-")[0]);
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
  };
}

export function currentFinancialYear(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(last).padStart(2, "0")}`,
  };
}

export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function parseReportFilters(
  searchParams: Record<string, string | string[] | undefined>,
  defaultCompanyIds: string[]
): ReportFilters {
  const get = (k: string) => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const company = get("company");
  const productId = get("product") || null;
  const salesmanId = get("salesman") || null;
  const partyId = get("party") || null;
  const month = get("month") || null;
  const fy = get("fy") || null;
  let from = get("from") || "";
  let to = get("to") || "";

  if (month) {
    const r = monthRange(month);
    from = r.from;
    to = r.to;
  } else if (fy) {
    const r = financialYearRange(fy);
    from = r.from;
    to = r.to;
  } else if (!from || !to) {
    const ym = todayISO().slice(0, 7);
    const r = monthRange(ym);
    from = from || r.from;
    to = to || todayISO();
  }

  const companyIds =
    company && defaultCompanyIds.includes(company)
      ? [company]
      : defaultCompanyIds;

  return {
    companyIds,
    productId,
    salesmanId,
    partyId,
    from,
    to,
    month,
    financialYear: fy,
  };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}
