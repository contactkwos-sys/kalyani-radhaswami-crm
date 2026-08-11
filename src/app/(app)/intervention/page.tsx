import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getOwnerInterventionList } from "@/lib/sales/analytics";
import type { AttentionSeverity } from "@/types/sales";

const TONE: Record<AttentionSeverity, string> = {
  RED: "border-red-200 bg-red-50 text-red-900",
  AMBER: "border-amber-200 bg-amber-50 text-amber-900",
  BLUE: "border-sky-200 bg-sky-50 text-sky-900",
  GREEN: "border-emerald-200 bg-emerald-50 text-emerald-900",
  GREY: "border-zinc-200 bg-zinc-50 text-zinc-800",
};

export default async function InterventionPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const items = await getOwnerInterventionList(ctx.selectedCompanyIds);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Owner Intervention
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Parties requiring attention based on configurable rules.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {(["RED", "AMBER", "BLUE", "GREY", "GREEN"] as AttentionSeverity[]).map(
          (s) => (
            <span key={s} className={`rounded-md border px-2 py-1 ${TONE[s]}`}>
              {s}: {items.filter((i) => i.severity === s).length}
            </span>
          )
        )}
      </div>

      <ul className="space-y-3">
        {items.map((item, idx) => (
          <li
            key={`${item.party_id}-${item.rule_code}-${idx}`}
            className={`rounded-xl border p-4 ${TONE[item.severity]}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-wide">{item.severity}</p>
                <Link
                  href={`/parties/${item.party_id}/360`}
                  className="text-lg font-semibold underline-offset-2 hover:underline"
                >
                  {item.party_name}
                </Link>
                <p className="mt-1 text-sm">
                  {item.reason}
                  {item.product_name ? ` · ${item.product_name}` : ""}
                  {item.salesman_name ? ` · ${item.salesman_name}` : ""}
                </p>
                <p className="text-sm opacity-80">{item.metric}</p>
              </div>
              <Link
                href={`/parties/${item.party_id}/360`}
                className="rounded-md bg-white/80 px-3 py-1.5 text-sm font-medium"
              >
                Open 360
              </Link>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--muted)]">
            No intervention items for the selected company scope.
          </li>
        )}
      </ul>
    </div>
  );
}
