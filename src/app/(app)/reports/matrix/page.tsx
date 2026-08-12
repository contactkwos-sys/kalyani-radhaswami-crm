import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveCompanyContext } from "@/lib/masters/context";
import { getProductPartyMatrix } from "@/lib/intelligence/matrix";
import { MATRIX_STATUS_LABELS, type MatrixStatus } from "@/types/intelligence";

const CELL: Record<MatrixStatus, string> = {
  NOT_ASSIGNED: "bg-zinc-100 text-zinc-500",
  ASSIGNED: "bg-sky-50 text-sky-800",
  VISIT_STARTED: "bg-amber-50 text-amber-900",
  SAMPLE_GIVEN: "bg-orange-50 text-orange-900",
  TRIAL: "bg-violet-50 text-violet-900",
  REGULAR_ORDER: "bg-emerald-50 text-emerald-900",
  STOPPED: "bg-red-50 text-red-800",
  NO_RESPONSE: "bg-stone-100 text-stone-700",
};

export default async function MatrixPage() {
  let ctx;
  try {
    ctx = await getActiveCompanyContext();
  } catch {
    redirect("/login");
  }
  if (!["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN", "SALES_MANAGER"].includes(ctx.profile.role)) {
    redirect("/dashboard");
  }

  const { parties, products, cells } = await getProductPartyMatrix(
    ctx.selectedCompanyIds
  );

  const cellMap = new Map(
    cells.map((c) => [`${c.party_id}:${c.product_id}`, c])
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reports" className="text-sm text-[var(--accent)] hover:underline">
          ← Reports
        </Link>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Product + Party Development Matrix
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Click a cell for Party + Product history
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
        {(Object.keys(MATRIX_STATUS_LABELS) as MatrixStatus[]).map((s) => (
          <span key={s} className={`rounded px-2 py-1 ${CELL[s]}`}>
            {MATRIX_STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-max text-left text-xs">
          <thead>
            <tr className="bg-[var(--surface-2)]">
              <th className="sticky left-0 z-10 bg-[var(--surface-2)] px-3 py-2">
                Party
              </th>
              {products.map((p) => (
                <th key={p.id} className="px-2 py-2 font-medium">
                  {p.product_code || p.product_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parties.map((party) => (
              <tr key={party.id} className="border-t border-[var(--border)]">
                <td className="sticky left-0 z-10 bg-[var(--surface)] px-3 py-2 font-medium">
                  <Link
                    href={`/parties/${party.id}/360`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {party.party_name}
                  </Link>
                </td>
                {products
                  .filter((p) => p.company_id === party.company_id)
                  .concat(
                    products.filter((p) => p.company_id !== party.company_id)
                  )
                  .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
                  .map((product) => {
                    if (product.company_id !== party.company_id) {
                      return (
                        <td key={product.id} className="px-1 py-1">
                          <span className="block rounded px-1 py-2 text-center text-[var(--muted)]">
                            —
                          </span>
                        </td>
                      );
                    }
                    const cell = cellMap.get(`${party.id}:${product.id}`);
                    const status = (cell?.status || "NOT_ASSIGNED") as MatrixStatus;
                    return (
                      <td key={product.id} className="px-1 py-1">
                        <Link
                          href={`/reports/matrix/${party.id}/${product.id}`}
                          className={`block rounded px-1 py-2 text-center font-medium ${CELL[status]}`}
                          title={MATRIX_STATUS_LABELS[status]}
                        >
                          {status === "NOT_ASSIGNED"
                            ? "·"
                            : status
                                .split("_")
                                .map((w) => w[0])
                                .join("")}
                        </Link>
                      </td>
                    );
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
