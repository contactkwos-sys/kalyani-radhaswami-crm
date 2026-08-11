import Link from "next/link";
import { redirect } from "next/navigation";
import { PrintButton } from "@/components/intelligence/ExportCsvButton";
import { getSalesmanDailyReview } from "@/lib/intelligence/daily-review";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { todayISO } from "@/lib/intelligence/filters";

export default async function DailyReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const date =
    typeof sp.date === "string" && sp.date ? sp.date : todayISO();
  const reviews = await getSalesmanDailyReview(ctx.selectedCompanyIds, date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
            ← Reports
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            Salesman Daily Review
          </h2>
          <p className="text-sm text-[var(--muted)]">{date}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <form>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="ml-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
            >
              Load
            </button>
          </form>
          <PrintButton />
        </div>
      </div>

      {reviews.map((r) => (
        <section
          key={r.salesman.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{r.salesman.name}</h3>
              <p className="text-sm text-[var(--muted)]">
                Sales ₹{r.todaysSales.toLocaleString("en-IN")} · Target ₹
                {r.todaysTarget.toLocaleString("en-IN")} · Ach{" "}
                {r.achievementPct.toFixed(1)}% · Est incentive ₹
                {r.estimatedIncentive.toLocaleString("en-IN")}
              </p>
            </div>
            <p className="text-sm">
              Visit time: {Math.round(r.totalDuration / 60)} min · GPS visits:{" "}
              {r.visits.length}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2 text-sm">
            <div>
              <h4 className="font-medium">Planned parties</h4>
              <ul className="mt-2 space-y-1">
                {r.plannedParties.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/parties/${p.party_id}/360`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {p.party_name}
                    </Link>{" "}
                    · {p.status}
                    {p.reasonNotVisited && (
                      <p className="text-xs text-amber-800">{p.reasonNotVisited}</p>
                    )}
                  </li>
                ))}
                {r.plannedParties.length === 0 && (
                  <li className="text-[var(--muted)]">No plan for this day.</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="font-medium">Visited (GPS verified)</h4>
              <ul className="mt-2 space-y-2">
                {r.visits.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/visits/${v.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {v.party_name}
                    </Link>
                    <p className="text-[var(--muted)]">
                      {v.duration_seconds != null
                        ? `${Math.round(Number(v.duration_seconds) / 60)} min`
                        : ""}
                      {v.person_met ? ` · Met ${v.person_met}` : ""}
                      {v.sample_given ? " · Sample" : ""}
                    </p>
                    {v.discussion && <p>{v.discussion}</p>}
                  </li>
                ))}
                {r.visits.length === 0 && (
                  <li className="text-[var(--muted)]">No GPS visits.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="mt-4 text-sm">
            <h4 className="font-medium">Accountant sales today</h4>
            <ul className="mt-1 space-y-1">
              {r.sales.map((s) => (
                <li key={s.id}>
                  Invoice {s.invoice_number || "—"} · ₹
                  {Number(s.sales_value).toLocaleString("en-IN")}
                </li>
              ))}
              {r.sales.length === 0 && (
                <li className="text-[var(--muted)]">No sales entered.</li>
              )}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
