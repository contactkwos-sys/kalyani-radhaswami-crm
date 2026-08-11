import Link from "next/link";
import { redirect } from "next/navigation";
import { CompleteFollowupButton } from "@/components/visits/CompleteFollowupButton";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default async function FollowUpsPage() {
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");
  const supabase = await createClient();
  const today = todayISO();

  let salesmanIds: string[] | null = null;
  if (profile.role === "SALESMAN") {
    const { data } = await supabase
      .from("crm_salesmen")
      .select("id")
      .eq("user_id", profile.id);
    salesmanIds = (data || []).map((s) => s.id);
  }

  let query = supabase
    .from("crm_followups")
    .select(
      "*, party:crm_parties(id,party_name,party_code), salesman:crm_salesmen(name)"
    )
    .eq("is_completed", false)
    .order("followup_date");

  if (salesmanIds) {
    if (salesmanIds.length === 0) {
      return <Empty />;
    }
    query = query.in("salesman_id", salesmanIds);
  }

  const { data: rows } = await query;
  const overdue = (rows || []).filter((r) => r.followup_date < today);
  const todayRows = (rows || []).filter((r) => r.followup_date === today);
  const upcoming = (rows || []).filter((r) => r.followup_date > today);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Follow-ups
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          OVERDUE · TODAY · UPCOMING
        </p>
      </div>
      <Section title="OVERDUE" tone="red" items={overdue} />
      <Section title="TODAY" tone="amber" items={todayRows} />
      <Section title="UPCOMING" tone="green" items={upcoming} />
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-2xl font-semibold">Follow-ups</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">No salesman link found.</p>
    </div>
  );
}

function Section({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber" | "green";
  items: Array<{
    id: string;
    followup_date: string;
    purpose: string | null;
    priority: string;
    party?: { id: string; party_name: string; party_code: string } | null;
    salesman?: { name: string } | null;
  }>;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-emerald-200 bg-emerald-50";

  return (
    <section className={`rounded-xl border p-4 ${toneClass}`}>
      <h3 className="font-semibold">
        {title} ({items.length})
      </h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/80 px-3 py-2 text-sm"
          >
            <div>
              {item.party ? (
                <Link
                  href={`/parties/${item.party.id}`}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {item.party.party_name}
                </Link>
              ) : (
                <span className="font-medium">Unknown party</span>
              )}
              <p className="text-[var(--muted)]">
                {item.followup_date} · {item.priority}
                {item.purpose ? ` · ${item.purpose}` : ""}
                {item.salesman ? ` · ${item.salesman.name}` : ""}
              </p>
            </div>
            <CompleteFollowupButton id={item.id} />
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-[var(--muted)]">None</li>
        )}
      </ul>
    </section>
  );
}
