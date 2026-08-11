import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SalesmanForm } from "@/components/masters/SalesmanForm";
import { getActiveCompanyContext } from "@/lib/masters/context";
import {
  getSalesman,
  getSalesmanProductAssignments,
} from "@/lib/masters/actions";
import { createClient } from "@/lib/supabase/server";
import { ROLE_PERMISSIONS } from "@/types/database";
import type { Territory } from "@/types/masters";

export default async function SalesmanDetailPage({
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
  const salesman = await getSalesman(id);
  if (!salesman) notFound();

  const supabase = await createClient();
  const [{ data: territories }, productAssignments, { data: partyAssignments }] =
    await Promise.all([
      supabase
        .from("crm_territories")
        .select("*")
        .in(
          "company_id",
          ctx.companies.map((c) => c.id)
        )
        .eq("is_active", true)
        .order("name"),
      getSalesmanProductAssignments(id),
      supabase
        .from("crm_party_salesmen")
        .select("*, party:crm_parties(id,party_name,party_code,status)")
        .eq("salesman_id", id)
        .eq("is_active", true),
    ]);

  const canManage = ROLE_PERMISSIONS[ctx.profile.role].canManageMasters;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/salesmen" className="text-sm text-[var(--accent)] hover:underline">
          ← Salesmen
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {salesman.name}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {salesman.employee_id} · {salesman.company?.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Monthly Target" value={`₹${Number(salesman.monthly_target).toLocaleString("en-IN")}`} />
        <Stat label="Assigned Products" value={String(productAssignments.length)} />
        <Stat label="Assigned Parties" value={String((partyAssignments || []).length)} />
        <Stat label="Status" value={salesman.status} />
      </div>

      {canManage && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <SalesmanForm
            companies={ctx.companies}
            territories={(territories || []) as Territory[]}
            salesman={salesman}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Assigned Products</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {productAssignments.map((a: { id: string; product?: { product_name: string; product_code: string } | null }) => (
              <li key={a.id}>
                {a.product?.product_name} ({a.product?.product_code})
              </li>
            ))}
            {productAssignments.length === 0 && (
              <li className="text-[var(--muted)]">None</li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Assigned Parties</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(partyAssignments || []).map(
              (a: {
                id: string;
                party?: { id: string; party_name: string; status: string } | null;
              }) => (
                <li key={a.id}>
                  {a.party ? (
                    <Link
                      href={`/parties/${a.party.id}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {a.party.party_name}
                    </Link>
                  ) : (
                    "—"
                  )}{" "}
                  <span className="text-[var(--muted)]">({a.party?.status})</span>
                </li>
              )
            )}
            {(partyAssignments || []).length === 0 && (
              <li className="text-[var(--muted)]">None</li>
            )}
          </ul>
        </div>
      </div>
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
