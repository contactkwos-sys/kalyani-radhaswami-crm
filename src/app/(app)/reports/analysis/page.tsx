import Link from "next/link";
import { redirect } from "next/navigation";
import { getReportContext } from "@/lib/intelligence/context";
import { getSalesmanPartyProductAnalysis } from "@/lib/intelligence/performance";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  let ctx;
  try {
    ctx = await getReportContext(sp);
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const salesmanId = typeof sp.salesman === "string" ? sp.salesman : "";
  const partyId = typeof sp.party === "string" ? sp.party : "";
  const productId = typeof sp.product === "string" ? sp.product : "";

  const analysis =
    salesmanId && partyId && productId
      ? await getSalesmanPartyProductAnalysis({
          salesmanId,
          partyId,
          productId,
        })
      : null;

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
          ← Reports
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Salesman vs Party Analysis
        </h2>
      </div>

      <form className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-3">
        <label className="text-sm">
          Salesman
          <select name="salesman" required defaultValue={salesmanId} className={field}>
            <option value="">Select</option>
            {ctx.salesmen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Party
          <select name="party" required defaultValue={partyId} className={field}>
            <option value="">Select</option>
            {ctx.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.party_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Product
          <select name="product" required defaultValue={productId} className={field}>
            <option value="">Select</option>
            {ctx.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Analyse
          </button>
        </div>
      </form>

      {analysis && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Visits" value={String(analysis.metrics.visitCount)} />
            <Stat
              label="Total visit time"
              value={`${Math.round(analysis.metrics.totalVisitSeconds / 60)} min`}
            />
            <Stat
              label="Avg duration"
              value={`${Math.round(analysis.metrics.avgDuration / 60)} min`}
            />
            <Stat label="Follow-ups" value={String(analysis.metrics.followups)} />
            <Stat label="Samples" value={String(analysis.metrics.samplesGiven)} />
            <Stat
              label="Sales"
              value={`₹${analysis.metrics.salesValue.toLocaleString("en-IN")}`}
            />
            <Stat label="Last visit" value={analysis.metrics.lastVisit || "—"} />
            <Stat
              label="Next follow-up"
              value={analysis.metrics.nextFollowup || "—"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Visit → Sample %"
              value={`${analysis.metrics.visitToSample.toFixed(1)}%`}
            />
            <Stat
              label="Sample → Order %"
              value={`${analysis.metrics.sampleToOrder.toFixed(1)}%`}
            />
            <Stat
              label="Visit → Order %"
              value={`${analysis.metrics.visitToOrder.toFixed(1)}%`}
            />
          </div>

          <p className="text-sm">
            Conversion status:{" "}
            <strong>{analysis.metrics.conversion}</strong> ·{" "}
            <Link
              href={`/parties/${partyId}/360`}
              className="text-[var(--accent)] hover:underline"
            >
              Open Party 360
            </Link>
          </p>
        </>
      )}
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
