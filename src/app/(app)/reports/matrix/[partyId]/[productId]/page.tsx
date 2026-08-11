import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPartyProductHistory } from "@/lib/intelligence/matrix";
import { DEV_STATUS_LABELS, type DevStatus } from "@/types/sales";
import { requireProfile } from "@/lib/auth/session";

export default async function PartyProductHistoryPage({
  params,
}: {
  params: Promise<{ partyId: string; productId: string }>;
}) {
  const { partyId, productId } = await params;
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");
  if (!["OWNER", "ADMIN", "SALES_MANAGER"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const data = await getPartyProductHistory(partyId, productId);
  if (!data.party || !data.product) notFound();

  type Item = { sortKey: number; at: string; title: string; detail: string };
  const timeline: Item[] = [];

  for (const v of data.visits) {
    const fb = Array.isArray(v.feedback) ? v.feedback[0] : v.feedback;
    const sm = Array.isArray(v.salesman) ? v.salesman[0] : v.salesman;
    const start = v.start_at ? new Date(v.start_at) : null;
    const end = v.end_at ? new Date(v.end_at) : null;
    timeline.push({
      sortKey: start?.getTime() || 0,
      at: start
        ? `${v.visit_date} · ${start.toLocaleTimeString()}`
        : v.visit_date,
      title: `Visit${v.gps_verified ? " (GPS verified)" : ""}`,
      detail: [
        sm?.name,
        start && end
          ? `${start.toLocaleTimeString()} – ${end.toLocaleTimeString()}`
          : null,
        v.duration_seconds != null
          ? `${Math.round(Number(v.duration_seconds) / 60)} min`
          : null,
        v.start_latitude != null
          ? `GPS ${v.start_latitude}, ${v.start_longitude}`
          : null,
        fb?.person_met ? `Met: ${fb.person_met}` : null,
        fb?.discussion ? `Discussion: ${fb.discussion}` : null,
        fb?.sample_given ? "Sample given" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const s of data.sales) {
    const sm = Array.isArray(s.salesman) ? s.salesman[0] : s.salesman;
    timeline.push({
      sortKey: new Date(s.sale_date).getTime(),
      at: s.sale_date,
      title: `Sale ₹${Number(s.sales_value).toLocaleString("en-IN")}`,
      detail: [sm?.name, s.invoice_number, `Qty ${s.quantity}`]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const h of data.history) {
    timeline.push({
      sortKey: new Date(h.created_at).getTime(),
      at: new Date(h.created_at).toLocaleString(),
      title: `Status → ${DEV_STATUS_LABELS[h.to_status as DevStatus] || h.to_status}`,
      detail: h.notes || h.source_module,
    });
  }

  for (const f of data.followups) {
    timeline.push({
      sortKey: new Date(f.followup_date).getTime(),
      at: f.followup_date,
      title: f.is_completed ? "Follow-up completed" : "Follow-up scheduled",
      detail: f.purpose || "",
    });
  }

  timeline.sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/reports/matrix"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← Matrix
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {data.party.party_name}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Product: {data.product.product_name} · Status:{" "}
          {data.status
            ? DEV_STATUS_LABELS[data.status.development_status as DevStatus]
            : "Not assigned"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Visits" value={String(data.visits.length)} />
        <Stat label="Samples" value={String(data.samples.length)} />
        <Stat
          label="Sales"
          value={`₹${data.sales
            .reduce((a, s) => a + Number(s.sales_value), 0)
            .toLocaleString("en-IN")}`}
        />
        <Stat
          label="Matrix"
          value={data.status?.matrix_status || "NOT_ASSIGNED"}
        />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Chronological history</h3>
        <ol className="mt-4 space-y-4">
          {timeline.map((item, idx) => (
            <li key={idx} className="border-l border-[var(--border)] pl-4">
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                {item.at}
              </p>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-[var(--muted)]">{item.detail}</p>
            </li>
          ))}
          {timeline.length === 0 && (
            <li className="text-sm text-[var(--muted)]">No history yet.</li>
          )}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs uppercase text-[var(--muted)]">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
