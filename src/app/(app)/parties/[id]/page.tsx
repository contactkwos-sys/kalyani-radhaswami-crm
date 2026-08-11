import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PartyForm } from "@/components/masters/PartyForm";
import { StartVisitButton } from "@/components/visits/VisitControls";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getParty, getPartyAssignments } from "@/lib/masters/actions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  const party = await getParty(id);
  if (!party) notFound();
  const assignments = await getPartyAssignments(id);
  const canManage = ROLE_PERMISSIONS[ctx.profile.role].canManageMasters;

  const supabase = await createClient();
  const [{ data: visits }, { data: mySalesman }] = await Promise.all([
    supabase
      .from("crm_visits")
      .select(
        "id, visit_date, start_at, end_at, duration_seconds, gps_verified, status, start_distance_meters, salesman:crm_salesmen(name), feedback:crm_visit_feedback(person_met,sample_given,discussion)"
      )
      .eq("party_id", id)
      .order("start_at", { ascending: false }),
    supabase
      .from("crm_salesmen")
      .select("id")
      .eq("user_id", ctx.profile.id)
      .eq("company_id", party.company_id)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);

  const firstAssignment = assignments.salesmen[0] as
    | { salesman_id?: string }
    | undefined;
  const salesmanForVisit = mySalesman?.id || firstAssignment?.salesman_id || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/parties" className="text-sm text-[var(--accent)] hover:underline">
            ← Parties
          </Link>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
            {party.party_name}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {party.party_code} · {party.company?.name} · {party.status}
          </p>
        </div>
        {salesmanForVisit && party.latitude != null && party.longitude != null && (
          <div className="w-full max-w-xs">
            <StartVisitButton partyId={party.id} salesmanId={salesmanForVisit} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Potential / month"
          value={`₹${Number(party.potential_monthly_business).toLocaleString("en-IN")}`}
        />
        <Stat
          label="Current business"
          value={`₹${Number(party.current_business).toLocaleString("en-IN")}`}
        />
        <Stat
          label="GPS"
          value={
            party.latitude != null && party.longitude != null
              ? `${party.latitude}, ${party.longitude}`
              : "Not set"
          }
        />
        <Stat label="Contact" value={party.contact_person || party.mobile || "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Assigned Salesmen / Products</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {assignments.salesmen.map(
              (a: {
                id: string;
                salesman?: { name: string } | null;
                product?: { product_name: string } | null;
              }) => (
                <li key={a.id}>
                  {a.salesman?.name || "—"}
                  {a.product ? ` · ${a.product.product_name}` : ""}
                </li>
              )
            )}
            {assignments.salesmen.length === 0 && (
              <li className="text-[var(--muted)]">No salesman assigned.</li>
            )}
          </ul>
        </div>

        <div
          id="history"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <h3 className="font-semibold">VIEW COMPLETE HISTORY</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {(visits || []).map(
              (v: {
                id: string;
                visit_date: string;
                start_at: string | null;
                duration_seconds: number | null;
                gps_verified: boolean;
                status: string;
                salesman?: { name: string } | null;
                feedback?:
                  | {
                      person_met: string | null;
                      sample_given: boolean;
                      discussion: string | null;
                    }
                  | Array<{
                      person_met: string | null;
                      sample_given: boolean;
                      discussion: string | null;
                    }>
                  | null;
              }) => {
                const fb = Array.isArray(v.feedback) ? v.feedback[0] : v.feedback;
                return (
                  <li
                    key={v.id}
                    className="border-b border-[var(--border)] pb-2 last:border-0"
                  >
                    <Link
                      href={`/visits/${v.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {v.visit_date}
                      {v.start_at
                        ? ` · ${new Date(v.start_at).toLocaleTimeString()}`
                        : ""}
                    </Link>
                    <p className="text-[var(--muted)]">
                      {v.status}
                      {v.gps_verified ? " · GPS Verified" : ""}
                      {v.duration_seconds != null
                        ? ` · ${Math.round(v.duration_seconds / 60)} minutes`
                        : ""}
                      {v.salesman ? ` · ${v.salesman.name}` : ""}
                      {fb?.person_met ? ` · Met ${fb.person_met}` : ""}
                      {fb?.sample_given ? " · Sample Given" : ""}
                    </p>
                    {fb?.discussion && (
                      <p className="mt-1 text-[var(--ink)]">{fb.discussion}</p>
                    )}
                  </li>
                );
              }
            )}
            {(visits || []).length === 0 && (
              <li className="text-[var(--muted)]">
                No visits yet. History fills as GPS-verified visits are recorded.
              </li>
            )}
          </ul>
        </div>
      </div>

      {(canManage ||
        ctx.profile.role === "SALESMAN" ||
        ctx.profile.role === "SALES_MANAGER") && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <PartyForm companies={ctx.companies} party={party} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold break-all">{value}</p>
    </div>
  );
}
