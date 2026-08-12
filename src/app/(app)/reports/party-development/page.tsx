import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getReportContext } from "@/lib/intelligence/context";
import { getPartyDevelopmentReport } from "@/lib/intelligence/reports-data";
import { DEV_STATUS_LABELS, type DevStatus } from "@/types/sales";

export default async function PartyDevelopmentReportPage({
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
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }
  const rows = await getPartyDevelopmentReport(ctx.filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Party Development Report
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="party-development.csv"
            rows={rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              return {
                party: party?.party_name,
                product: product?.product_name,
                status: r.development_status,
                matrix: r.matrix_status,
                visits: r.total_visits,
                sales: r.total_sales_value,
                sample_at: r.sample_given_at,
              };
            })}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Visits</th>
              <th className="px-3 py-2">Sales</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              return (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/parties/${r.party_id}/360`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {party?.party_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{product?.product_name}</td>
                  <td className="px-3 py-2">
                    {DEV_STATUS_LABELS[r.development_status as DevStatus] ||
                      r.development_status}
                  </td>
                  <td className="px-3 py-2">{r.total_visits}</td>
                  <td className="px-3 py-2">
                    ₹{Number(r.total_sales_value).toLocaleString("en-IN")}
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
