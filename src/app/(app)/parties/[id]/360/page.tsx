import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getParty360 } from "@/lib/sales/development";
import { DEV_STATUS_LABELS, type DevStatus } from "@/types/sales";
import { requireProfile } from "@/lib/auth/session";

export default async function Party360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile().catch(() => null);
  if (!profile) redirect("/login");

  let data;
  try {
    data = await getParty360(id);
  } catch {
    notFound();
  }

  const { party, assignments, productStatuses, visits, sales, history, stats } =
    data;

  type TimelineItem = {
    at: string;
    sortKey: number;
    title: string;
    detail: string;
    kind: "visit" | "sale" | "status";
  };

  const timeline: TimelineItem[] = [];

  for (const v of visits) {
    const fb = Array.isArray(v.feedback) ? v.feedback[0] : v.feedback;
    const start = v.start_at ? new Date(v.start_at) : null;
    timeline.push({
      at: start
        ? `${v.visit_date} · ${start.toLocaleTimeString()}`
        : v.visit_date,
      sortKey: start ? start.getTime() : 0,
      title: v.gps_verified ? "GPS verified visit" : `Visit (${v.status})`,
      detail: [
        v.salesman?.name ? `Salesman: ${v.salesman.name}` : null,
        fb?.person_met ? `Met: ${fb.person_met}` : null,
        fb?.discussion ? `Discussion: ${fb.discussion}` : null,
        v.duration_seconds != null
          ? `Duration: ${Math.round(Number(v.duration_seconds) / 60)} minutes`
          : null,
        fb?.sample_given ? "Sample: Yes" : "Sample: No",
      ]
        .filter(Boolean)
        .join(" · "),
      kind: "visit",
    });
  }

  for (const s of sales) {
    timeline.push({
      at: s.sale_date,
      sortKey: new Date(s.sale_date).getTime(),
      title: `Sale ₹${Number(s.sales_value).toLocaleString("en-IN")}`,
      detail: [
        s.product?.product_name,
        s.salesman?.name,
        s.invoice_number ? `Invoice ${s.invoice_number}` : null,
        `Qty ${s.quantity}`,
      ]
        .filter(Boolean)
        .join(" · "),
      kind: "sale",
    });
  }

  for (const h of history) {
    timeline.push({
      at: new Date(h.created_at).toLocaleString(),
      sortKey: new Date(h.created_at).getTime(),
      title: `Status → ${DEV_STATUS_LABELS[h.to_status as DevStatus] || h.to_status}`,
      detail: [
        h.product?.product_name,
        h.from_status
          ? `From ${DEV_STATUS_LABELS[h.from_status as DevStatus] || h.from_status}`
          : null,
        h.notes,
        h.source_module,
      ]
        .filter(Boolean)
        .join(" · "),
      kind: "status",
    });
  }

  timeline.sort((a, b) => a.sortKey - b.sortKey);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/parties/${id}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← Party master
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          {party.party_name}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Party 360° ·{" "}
          {Array.isArray(party.company)
            ? party.company[0]?.name
            : party.company?.name}{" "}
          · {party.party_code}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Visits" value={String(stats.totalVisits)} />
        <Stat label="Total Time" value={`${stats.totalTimeHours}h`} />
        <Stat label="Samples" value={String(stats.samples)} />
        <Stat
          label="Sales"
          value={`₹${Number(stats.salesValue).toLocaleString("en-IN")}`}
        />
        <Stat label="Conversion" value={stats.converted ? "Yes" : "No"} />
        <Stat label="Last Follow-up" value={stats.lastFollowup || "—"} />
        <Stat label="Next Follow-up" value={stats.nextFollowup || "—"} />
        <Stat
          label="Potential"
          value={`₹${Number(party.potential_monthly_business).toLocaleString("en-IN")}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Assigned salesman / products</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {assignments.map(
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
            {assignments.length === 0 && (
              <li className="text-[var(--muted)]">No assignments</li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h3 className="font-semibold">Product development status</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {productStatuses.map(
              (p: {
                id: string;
                development_status: DevStatus;
                total_visits: number;
                total_sales_value: number;
                product?: { product_name: string } | null;
              }) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span>
                    {p.product?.product_name} ·{" "}
                    {DEV_STATUS_LABELS[p.development_status]}
                  </span>
                  <span className="text-[var(--muted)]">
                    {p.total_visits}v · ₹
                    {Number(p.total_sales_value).toLocaleString("en-IN")}
                  </span>
                </li>
              )
            )}
            {productStatuses.length === 0 && (
              <li className="text-[var(--muted)]">No product development yet</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Immutable timeline</h3>
        <ol className="mt-4 space-y-4">
          {timeline.map((item, idx) => (
            <li key={`${item.sortKey}-${idx}`} className="relative pl-4 border-l border-[var(--border)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {item.at} · {item.kind}
              </p>
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-[var(--muted)]">{item.detail}</p>
            </li>
          ))}
          {timeline.length === 0 && (
            <li className="text-sm text-[var(--muted)]">No history yet.</li>
          )}
        </ol>
      </div>
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
