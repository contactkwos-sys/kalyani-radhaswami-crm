import { getActiveCompanyContext } from "@/lib/masters/context";
import { listParties, listProducts, listSalesmen } from "@/lib/masters/actions";
import { parseReportFilters } from "@/lib/intelligence/filters";
import type { ReportFilters } from "@/types/intelligence";

export async function getReportContext(
  searchParams: Record<string, string | string[] | undefined>
) {
  const ctx = await getActiveCompanyContext();
  const filters: ReportFilters = parseReportFilters(
    searchParams,
    ctx.selectedCompanyIds
  );
  const [products, salesmen, parties] = await Promise.all([
    listProducts(ctx.selectedCompanyIds),
    listSalesmen(ctx.selectedCompanyIds),
    listParties(ctx.selectedCompanyIds),
  ]);
  return {
    ...ctx,
    filters,
    products,
    salesmen,
    parties,
  };
}
