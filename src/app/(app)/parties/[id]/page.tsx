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
        "id, visit_date, start_at, end_at, duration_seconds, gps_verified, status, start_distance_meters, salesman_id, salesman:crm_salesmen(name), feedback:crm_visit_feedback(person_met,sample_given,discussion)"
      )
      .eq("party_id", id)
      .order("start_at", { ascending: false }),
    supabase
      .from("crm_salesmen")
      .select("id, monthly_target, name")
      .eq("user_id", ctx.profile.id)
      .eq("company_id", party.company_id)
      .eq("status", "ACTIVE")
      .maybeSingle(),
  ]);

  const month = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  }).slice(0, 7);

  let selfMonitor: {
    myVisits: number;
    lastDiscussion: string | null;
    samples: number;
    salesValue: number;
    nextFollowup: string | null;
    productStatuses: Array<{
      development_status: string;
      product?: { product_name: string } | null;
    }>;
    achievement: number;
    target: number;
    estimatedIncentive: number;
  } | null = null;

  if (mySalesman && ctx.profile.role === "SALESMAN") {
    const myVisits = (visits || []).filter((v) => v.salesman_id === mySalesman.id);
    const lastFb = myVisits
      .map((v) => (Array.isArray(v.feedback) ? v.feedback[0] : v.feedback))
      .find((f) => f?.discussion);
    const [{ data: mySales }, { data: samples }, { data: followups }, { data: pp }, { data: incentives }] =
      await Promise.all([
        supabase
          .from("crm_sales")
          .select("sales_value, sale_date")
          .eq("party_id", id)
          .eq("salesman_id", mySalesman.id),
        supabase
          .from("crm_samples")
          .select("id")
          .eq("party_id", id)
          .eq("salesman_id", mySalesman.id),
        supabase
          .from("crm_followups")
          .select("followup_date")
          .eq("party_id", id)
          .eq("salesman_id", mySalesman.id)
          .eq("is_completed", false)
          .order("followup_date")
          .limit(1),
        supabase
          .from("crm_party_products")
          .select("development_status, product:crm_products(product_name)")
          .eq("party_id", id)
          .eq("is_active", true),
        supabase
          .from("crm_incentive_calculations")
          .select("calculated_amount, status")
          .eq("salesman_id", mySalesman.id)
          .eq("year_month", month),
      ]);
    const monthSales = await supabase
      .from("crm_sales")
      .select("sales_value")
      .eq("salesman_id", mySalesman.id)
      .gte("sale_date", `${month}-01`);
    const monthValue = (monthSales.data || []).reduce(
      (a, s) => a + Number(s.sales_value),
      0
    );
    const target = Number(mySalesman.monthly_target || 0);
    selfMonitor = {
      myVisits: myVisits.filter((v) => v.gps_verified).length,
      lastDiscussion: lastFb?.discussion || null,
      samples: (samples || []).length,
      salesValue: (mySales || []).reduce((a, s) => a + Number(s.sales_value), 0),
      nextFollowup: followups?.[0]?.followup_date || null,
      productStatuses: (pp || []) as Array<{
        development_status: string;
        product?: { product_name: string } | null;
      }>,
      achievement: target > 0 ? (monthValue / target) * 100 : 0,
      target,
      estimatedIncentive: (incentives || [])
        .filter((i) => i.status === "ESTIMATED")
        .reduce((a, i) => a + Number(i.calculated_amount), 0),
    };
  }

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
          <Link
            href={`/parties/${party.id}/360`}
            className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Open Party 360°
          </Link>
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

      {selfMonitor && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">My monitoring (this party)</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <Stat label="My visits" value={String(selfMonitor.myVisits)} />
            <Stat
              label="Sales generated"
              value={`₹${selfMonitor.salesValue.toLocaleString("en-IN")}`}
            />
            <Stat label="Samples given" value={String(selfMonitor.samples)} />
            <Stat label="Follow-up due" value={selfMonitor.nextFollowup || "—"} />
            <Stat
              label="My target"
              value={`₹${selfMonitor.target.toLocaleString("en-IN")}`}
            />
            <Stat
              label="My achievement"
              value={`${selfMonitor.achievement.toFixed(1)}%`}
            />
            <Stat
              label="My incentive (est.)"
              value={`₹${selfMonitor.estimatedIncentive.toLocaleString("en-IN")}`}
            />
          </div>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Last conversation: {selfMonitor.lastDiscussion || "—"}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {selfMonitor.productStatuses.map((p, idx) => (
              <li key={idx}>
                {p.product?.product_name || "Product"} · {p.development_status}
              </li>
            ))}
          </ul>
        </section>
      )}

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
            {(visits || []).map((v) => {
              const salesman = Array.isArray(v.salesman) ? v.salesman[0] : v.salesman;
              const fbRaw = v.feedback;
              const fb = Array.isArray(fbRaw) ? fbRaw[0] : fbRaw;
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
                    {salesman?.name ? ` · ${salesman.name}` : ""}
                    {fb?.person_met ? ` · Met ${fb.person_met}` : ""}
                    {fb?.sample_given ? " · Sample Given" : ""}
                  </p>
                  {fb?.discussion && (
                    <p className="mt-1 text-[var(--ink)]">{fb.discussion}</p>
                  )}
                </li>
              );
            })}
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
