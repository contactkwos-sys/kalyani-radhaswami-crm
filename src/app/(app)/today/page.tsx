import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyPlanForm } from "@/components/visits/DailyPlanForm";
import { StartVisitButton } from "@/components/visits/VisitControls";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function TodayPage() {
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");

  const supabase = await createClient();
  let salesmanQuery = supabase
    .from("crm_salesmen")
    .select("*")
    .eq("status", "ACTIVE");

  if (profile.role === "SALESMAN") {
    salesmanQuery = salesmanQuery.eq("user_id", profile.id);
  }

  const { data: salesmen } = await salesmanQuery.order("name");
  const salesman =
    salesmen?.find((s) => s.user_id === profile.id) || salesmen?.[0] || null;

  if (!salesman) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-2xl font-semibold">Today</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          No salesman record available. Owner must create a salesman and link
          the user account.
        </p>
      </div>
    );
  }

  const planDate = todayISO();

  const [{ data: plan }, { data: assignedParties }, { data: todayVisits }] =
    await Promise.all([
      supabase
        .from("crm_daily_plans")
        .select("*, planned:crm_planned_visits(*, party:crm_parties(id,party_name,party_code,latitude,longitude))")
        .eq("salesman_id", salesman.id)
        .eq("plan_date", planDate)
        .maybeSingle(),
      supabase
        .from("crm_party_salesmen")
        .select("party:crm_parties(id,party_name,party_code,latitude,longitude,status)")
        .eq("salesman_id", salesman.id)
        .eq("is_active", true),
      supabase
        .from("crm_visits")
        .select("*, party:crm_parties(party_name)")
        .eq("salesman_id", salesman.id)
        .eq("visit_date", planDate)
        .order("start_at", { ascending: false }),
    ]);

  const parties = (assignedParties || [])
    .map((r: { party: unknown }) => r.party)
    .filter(Boolean) as Array<{
    id: string;
    party_name: string;
    party_code: string;
    latitude: number | null;
    longitude: number | null;
    status?: string;
  }>;

  const planned = (plan?.planned || []) as Array<{
    id: string;
    status: string;
    party: {
      id: string;
      party_name: string;
      party_code: string;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }>;

  const completed = planned.filter((p) => p.status === "COMPLETED").length;
  const pending = planned.filter((p) => p.status !== "COMPLETED").length;

  const activeVisit = (todayVisits || []).find(
    (v: { status: string; gps_verified: boolean }) =>
      v.status === "STARTED" && v.gps_verified
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Today
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {salesman.name} · {planDate}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Daily Target" value={`₹${Number(plan?.daily_sales_target || 0).toLocaleString("en-IN")}`} />
        <Stat label="Planned" value={String(plan?.planned_parties_count || planned.length)} />
        <Stat label="Completed" value={String(completed)} />
        <Stat label="Pending" value={String(pending)} />
      </div>

      {activeVisit && (
        <Link
          href={`/visits/${activeVisit.id}`}
          className="block rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900"
        >
          Active GPS-verified visit in progress — open timer / END VISIT
        </Link>
      )}

      <DailyPlanForm
        salesmanId={salesman.id}
        parties={parties}
        planDate={planDate}
        existingPartyIds={planned.map((p) => p.party?.id).filter(Boolean) as string[]}
        existingTarget={Number(plan?.daily_sales_target || 0)}
      />

      <section className="space-y-3">
        <h3 className="font-semibold">Planned visits</h3>
        {planned.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.party?.party_name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {row.party?.party_code} · {row.status}
                  {row.party?.latitude == null && " · GPS not set on party"}
                </p>
              </div>
              {row.party && row.status !== "COMPLETED" && (
                <div className="w-full sm:w-56">
                  <StartVisitButton
                    partyId={row.party.id}
                    salesmanId={salesman.id}
                    plannedVisitId={row.id}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        {planned.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            Save a daily plan to list parties for today.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Today&apos;s visits (including repeats)</h3>
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {(todayVisits || []).map(
            (v: {
              id: string;
              status: string;
              gps_verified: boolean;
              start_at: string | null;
              end_at: string | null;
              duration_seconds: number | null;
              start_distance_meters: number | null;
              party?: { party_name: string } | null;
            }) => (
              <li key={v.id} className="px-4 py-3 text-sm">
                <Link href={`/visits/${v.id}`} className="font-medium text-[var(--accent)] hover:underline">
                  {v.party?.party_name}
                </Link>
                <p className="text-[var(--muted)]">
                  {v.status}
                  {v.gps_verified ? " · GPS VERIFIED" : ""}
                  {v.start_distance_meters != null
                    ? ` · ${Number(v.start_distance_meters).toFixed(0)}m`
                    : ""}
                  {v.start_at
                    ? ` · ${new Date(v.start_at).toLocaleTimeString()}`
                    : ""}
                  {v.end_at
                    ? `–${new Date(v.end_at).toLocaleTimeString()}`
                    : ""}
                  {v.duration_seconds != null
                    ? ` · ${Math.round(v.duration_seconds / 60)} min`
                    : ""}
                </p>
              </li>
            )
          )}
          {(todayVisits || []).length === 0 && (
            <li className="px-4 py-6 text-[var(--muted)]">No visits yet today.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
