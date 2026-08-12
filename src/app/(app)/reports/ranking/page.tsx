import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getReportContext } from "@/lib/intelligence/context";
import { getSalesmanPerformance } from "@/lib/intelligence/performance";

export default async function RankingPage({
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
  const rows = [...(await getSalesmanPerformance(ctx.filters))].sort(
    (a, b) => b.achievementPct - a.achievementPct
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Salesman Ranking
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="salesman-ranking.csv"
            rows={rows.map((r, i) => ({
              rank: i + 1,
              name: r.name,
              achievement_pct: r.achievementPct,
              sales: r.salesAmount,
              visits: r.gpsVerifiedVisits,
              incentive: r.incentive,
            }))}
          />
        </div>
      </div>
      <ol className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className="flex justify-between gap-3 border-b border-[var(--border)] py-2 text-sm last:border-0"
          >
            <span>
              <strong>#{i + 1}</strong>{" "}
              <Link
                href={`/salesmen/${r.id}`}
                className="text-[var(--accent)] hover:underline"
              >
                {r.name}
              </Link>
            </span>
            <span>
              {r.achievementPct.toFixed(1)}% · ₹
              {r.salesAmount.toLocaleString("en-IN")} · {r.gpsVerifiedVisits}{" "}
              visits
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
