import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getInactiveAndHighVisitReport } from "@/lib/intelligence/reports-data";

export default async function InactiveReportPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }
  const { inactive, highVisit, settings } = await getInactiveAndHighVisitReport(
    ctx.selectedCompanyIds
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Inactive / High Visit · No Sales
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Inactive ≥ {settings.inactive_days} days · High visits ≥{" "}
            {settings.high_visits_no_sales}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="inactive-high-visit.csv"
            rows={[
              ...inactive.map((r) => ({
                type: "INACTIVE",
                party: r.party_name,
                product: r.product_name,
                metric: r.days ?? "never",
              })),
              ...highVisit.map((r) => ({
                type: "HIGH_VISIT_NO_SALES",
                party: r.party_name,
                product: r.product_name,
                metric: r.visits,
              })),
            ]}
          />
        </div>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-semibold">High visit / no sales</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {highVisit.map((r, i) => (
            <li key={i}>
              <Link
                href={`/parties/${r.party_id}/360`}
                className="text-[var(--accent)] hover:underline"
              >
                {r.party_name}
              </Link>{" "}
              · {r.product_name} · {r.visits} visits
            </li>
          ))}
          {highVisit.length === 0 && (
            <li className="text-[var(--muted)]">None</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-semibold">Inactive / ignored parties</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {inactive.map((r, i) => (
            <li key={i}>
              <Link
                href={`/parties/${r.party_id}/360`}
                className="text-[var(--accent)] hover:underline"
              >
                {r.party_name}
              </Link>{" "}
              · {r.product_name} ·{" "}
              {r.days == null ? "never visited" : `${r.days} days`}
            </li>
          ))}
          {inactive.length === 0 && (
            <li className="text-[var(--muted)]">None</li>
          )}
        </ul>
      </section>
    </div>
  );
}
