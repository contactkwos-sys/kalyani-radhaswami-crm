import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getReportContext } from "@/lib/intelligence/context";
import { getFollowupsReport } from "@/lib/intelligence/reports-data";

export default async function FollowupsReportPage({
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
  const rows = await getFollowupsReport(ctx.filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Follow-up Report
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="followups.csv"
            rows={rows.map((r) => {
              const party = Array.isArray(r.party) ? r.party[0] : r.party;
              const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
              return {
                date: r.followup_date,
                party: party?.party_name,
                salesman: salesman?.name,
                purpose: r.purpose,
                completed: r.is_completed ? "YES" : "NO",
                priority: r.priority,
              };
            })}
          />
        </div>
      </div>
      <ul className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        {rows.map((r) => {
          const party = Array.isArray(r.party) ? r.party[0] : r.party;
          const salesman = Array.isArray(r.salesman) ? r.salesman[0] : r.salesman;
          return (
            <li key={r.id} className="border-b border-[var(--border)] pb-2">
              <Link
                href={`/parties/${r.party_id}/360`}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                {party?.party_name}
              </Link>{" "}
              · {r.followup_date} · {salesman?.name} ·{" "}
              {r.is_completed ? "Done" : "Open"} · {r.purpose || "—"}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="text-[var(--muted)]">No follow-ups in range.</li>
        )}
      </ul>
    </div>
  );
}
