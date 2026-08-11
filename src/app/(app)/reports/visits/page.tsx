import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { ReportFiltersBar } from "@/components/intelligence/ReportFiltersBar";
import { getReportContext } from "@/lib/intelligence/context";
import { getVisitsReport } from "@/lib/intelligence/reports-data";

export default async function VisitsReportPage({
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
  if (!["OWNER", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }
  const rows = await getVisitsReport(ctx.filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Party / GPS Visit Report
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="visits-report.csv"
            rows={rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              return {
                date: r.visit_date,
                party: party?.party_name,
                product: product?.product_name,
                salesman: salesman?.name,
                gps: r.gps_verified ? "YES" : "NO",
                status: r.status,
                minutes:
                  r.duration_seconds != null
                    ? Math.round(Number(r.duration_seconds) / 60)
                    : "",
                lat: r.start_latitude,
                lng: r.start_longitude,
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
        defaults={{ from: ctx.filters.from, to: ctx.filters.to }}
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Salesman</th>
              <th className="px-3 py-2">GPS</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              return (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <Link href={`/visits/${r.id}`} className="text-[var(--accent)] hover:underline">
                      {r.visit_date}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{party?.party_name}</td>
                  <td className="px-3 py-2">{salesman?.name}</td>
                  <td className="px-3 py-2">{r.gps_verified ? "Verified" : "No"}</td>
                  <td className="px-3 py-2">
                    {r.duration_seconds != null
                      ? `${Math.round(Number(r.duration_seconds) / 60)}m`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
