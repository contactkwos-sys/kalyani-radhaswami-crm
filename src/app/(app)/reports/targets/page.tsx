import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExportCsvButton,
  PrintButton,
} from "@/components/intelligence/ExportCsvButton";
import { getReportContext } from "@/lib/intelligence/context";
import { getSalesmanPerformance } from "@/lib/intelligence/performance";

export default async function TargetsReportPage({
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
  const rows = await getSalesmanPerformance(ctx.filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Target Report
          </h2>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <ExportCsvButton
            filename="targets.csv"
            rows={rows.map((r) => ({
              salesman: r.name,
              target: r.target,
              actual: r.salesAmount,
              remaining: Math.max(0, r.target - r.salesAmount),
              achievement_pct: r.achievementPct,
            }))}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Salesman</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Actual</th>
              <th className="px-3 py-2">Remaining</th>
              <th className="px-3 py-2">Ach %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">₹{r.target.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">
                  ₹{r.salesAmount.toLocaleString("en-IN")}
                </td>
                <td className="px-3 py-2">
                  ₹{Math.max(0, r.target - r.salesAmount).toLocaleString("en-IN")}
                </td>
                <td className="px-3 py-2">{r.achievementPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        Configure monthly targets in{" "}
        <Link href="/settings/targets" className="text-[var(--accent)] hover:underline">
          Settings → Targets
        </Link>
      </p>
    </div>
  );
}
