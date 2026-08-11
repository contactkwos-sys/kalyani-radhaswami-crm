import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getReportContext } from "@/lib/intelligence/context";
import { getSamplesReport } from "@/lib/intelligence/reports-data";

export default async function SamplesReportPage({
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
  const { partyProducts } = await getSamplesReport(ctx.filters);
  const converted = partyProducts.filter((p) => Number(p.total_sales_value) > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Sample & Conversion Report
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Samples {partyProducts.length} · Converted {converted.length} · Rate{" "}
            {partyProducts.length
              ? ((converted.length / partyProducts.length) * 100).toFixed(1)
              : 0}
            %
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="samples.csv"
            rows={partyProducts.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              return {
                party: party?.party_name,
                product: product?.product_name,
                sample_at: r.sample_given_at,
                sales: r.total_sales_value,
                status: r.development_status,
                converted: Number(r.total_sales_value) > 0 ? "YES" : "NO",
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
              <th className="px-3 py-2">Sample date</th>
              <th className="px-3 py-2">Sales</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {partyProducts.map((r, idx) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const product = Array.isArray(r.product) ? r.product[0] : r.product;
              return (
                <tr key={idx} className="border-t border-[var(--border)]">
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
                    {r.sample_given_at
                      ? new Date(r.sample_given_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    ₹{Number(r.total_sales_value).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2">{r.development_status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
