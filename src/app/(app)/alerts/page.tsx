import Link from "next/link";
import { redirect } from "next/navigation";
import { getManagementAlerts } from "@/lib/intelligence/alerts";
import { getActiveCompanyContext } from "@/lib/masters/context";

const TONE = {
  RED: "border-red-200 bg-red-50 text-red-900",
  YELLOW: "border-amber-200 bg-amber-50 text-amber-900",
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-900",
} as const;

export default async function AlertsPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const alerts = await getManagementAlerts(ctx.selectedCompanyIds);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Owner Alerts
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configurable thresholds · click an alert to open the record
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {(["RED", "YELLOW", "GREEN"] as const).map((s) => (
          <span key={s} className={`rounded-md border px-2 py-1 ${TONE[s]}`}>
            {s}: {alerts.filter((a) => a.severity === s).length}
          </span>
        ))}
      </div>
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className={`rounded-xl border p-4 ${TONE[a.severity]}`}>
            <Link href={a.href} className="block">
              <p className="text-xs font-bold tracking-wide">{a.severity}</p>
              <p className="mt-1 text-base font-semibold">{a.title}</p>
              <p className="text-sm opacity-80">{a.detail}</p>
              <p className="mt-1 text-xs uppercase tracking-wide opacity-70">
                {a.rule_code}
              </p>
            </Link>
          </li>
        ))}
        {alerts.length === 0 && (
          <li className="rounded-xl border border-[var(--border)] p-6 text-[var(--muted)]">
            No alerts for the selected company scope.
          </li>
        )}
      </ul>
    </div>
  );
}
