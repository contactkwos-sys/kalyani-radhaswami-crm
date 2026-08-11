import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PartyForm } from "@/components/masters/PartyForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getParty, getPartyAssignments } from "@/lib/masters/actions";
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

  return (
    <div className="space-y-6">
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
          <ul className="mt-4 space-y-1 text-sm text-[var(--muted)]">
            {assignments.products.map(
              (a: {
                id: string;
                relation_type: string;
                product?: { product_name: string } | null;
              }) => (
                <li key={a.id}>
                  {a.product?.product_name} ({a.relation_type})
                </li>
              )
            )}
          </ul>
        </div>

        <div
          id="history"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <h3 className="font-semibold">VIEW COMPLETE HISTORY</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Party 360 timeline (visits, samples, trials, follow-ups, sales) will
            populate from Phase 3–5 activity. Master record and assignments are
            live now.
          </p>
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
