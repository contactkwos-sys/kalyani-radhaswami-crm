import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EndVisitButton } from "@/components/visits/VisitControls";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: visit } = await supabase
    .from("crm_visits")
    .select(
      "*, party:crm_parties(*), salesman:crm_salesmen(name,employee_id), product:crm_products(product_name), feedback:crm_visit_feedback(*)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!visit) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/today" className="text-sm text-[var(--accent)] hover:underline">
          ← Today
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {visit.party?.party_name}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {visit.salesman?.name} · {visit.visit_date}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Status" value={visit.status} />
        <Stat
          label="GPS"
          value={
            visit.gps_verified
              ? `VERIFIED · ${Number(visit.start_distance_meters || 0).toFixed(0)}m`
              : visit.gps_status
          }
        />
        <Stat
          label="Start"
          value={
            visit.start_at
              ? new Date(visit.start_at).toLocaleTimeString()
              : "—"
          }
        />
        <Stat
          label="Duration"
          value={
            visit.duration_seconds != null
              ? `${Math.round(visit.duration_seconds / 60)} min`
              : visit.status === "STARTED"
                ? "In progress"
                : "—"
          }
        />
      </div>

      {visit.rejection_reason && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {visit.rejection_reason}
        </p>
      )}

      {visit.status === "STARTED" && visit.gps_verified && visit.start_at && (
        <EndVisitButton visitId={visit.id} startAt={visit.start_at} />
      )}

      {visit.status === "ENDED" && (
        <Link
          href={`/visits/${visit.id}/feedback`}
          className="inline-flex rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white"
        >
          {visit.feedback ? "Edit Feedback" : "Add Visit Feedback"}
        </Link>
      )}

      {visit.feedback && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
          <h3 className="font-semibold">Feedback</h3>
          <p className="mt-2">
            Met: {visit.feedback.person_met || "—"} (
            {visit.feedback.designation || "—"})
          </p>
          <p className="mt-1 text-[var(--muted)]">{visit.feedback.discussion}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
