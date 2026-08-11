import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getReportContext } from "@/lib/intelligence/context";
import { getSalesReport } from "@/lib/intelligence/reports-data";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let ctx;
  try {
    ctx = await getReportContext(await searchParams);
  } catch {
    redirect("/login");
  }
  if (
    !["OWNER", "ADMIN", "SALES_MANAGER", "ACCOUNTANT", "VIEWER"].includes(
      ctx.profile.role
    )
  ) {
    redirect("/dashboard");
  }

  const rows = await getSalesReport(ctx.filters);
  const total = rows.reduce((a, r) => a + Number(r.sales_value), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Sales Report
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {ctx.filters.from} → {ctx.filters.to} · Total ₹
            {total.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="sales-report.csv"
            rows={rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              return {
                date: r.sale_date,
                invoice: r.invoice_number,
                party: party?.party_name,
                product: product?.product_name,
                salesman: salesman?.name,
                qty: r.quantity,
                rate: r.rate,
                value: r.sales_value,
                remarks: r.remarks,
              };
            })}
          />
        </div>
      </div>
      <ReportFiltersBar
        companies={ctx.companies.filter((c) =>
          ctx.selectedCompanyIds.includes(c.id)
        )}
        products={ctx.products}
        salesmen={ctx.salesmen}
        parties={ctx.parties}
        defaults={{
          from: ctx.filters.from,
          to: ctx.filters.to,
          product: ctx.filters.productId || "",
          salesman: ctx.filters.salesmanId || "",
          party: ctx.filters.partyId || "",
        }}
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Salesman</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              return (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.sale_date}</td>
                  <td className="px-3 py-2">{r.invoice_number || "—"}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/parties/${r.party_id}/360`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {party?.party_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{product?.product_name}</td>
                  <td className="px-3 py-2">{salesman?.name}</td>
                  <td className="px-3 py-2">{Number(r.quantity)}</td>
                  <td className="px-3 py-2">
                    ₹{Number(r.sales_value).toLocaleString("en-IN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
