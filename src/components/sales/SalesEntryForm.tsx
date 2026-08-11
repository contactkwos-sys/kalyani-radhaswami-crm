"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSalesBatch } from "@/lib/sales/actions";
import type { Company } from "@/types/database";
import type { Party, Product, Salesman } from "@/types/masters";

type Row = {
  key: string;
  company_id: string;
  product_id: string;
  party_id: string;
  salesman_id: string;
  sale_date: string;
  quantity: string;
  rate: string;
  sales_value: string;
  invoice_number: string;
  remarks: string;
};

function todayISO() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function emptyRow(companyId: string): Row {
  return {
    key: Math.random().toString(36).slice(2),
    company_id: companyId,
    product_id: "",
    party_id: "",
    salesman_id: "",
    sale_date: todayISO(),
    quantity: "1",
    rate: "",
    sales_value: "",
    invoice_number: "",
    remarks: "",
  };
}

export function SalesEntryForm({
  companies,
  products,
  parties,
  salesmen,
}: {
  companies: Company[];
  products: Product[];
  parties: Party[];
  salesmen: Salesman[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([
    emptyRow(companies[0]?.id || ""),
  ]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

  function update(key: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (
          (patch.quantity != null || patch.rate != null) &&
          next.rate &&
          next.quantity
        ) {
          const q = Number(next.quantity);
          const rate = Number(next.rate);
          if (!Number.isNaN(q) && !Number.isNaN(rate)) {
            next.sales_value = String(Math.round(q * rate * 100) / 100);
          }
        }
        return next;
      })
    );
  }

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const payload = rows.map((r) => ({
          company_id: r.company_id,
          product_id: r.product_id,
          party_id: r.party_id,
          salesman_id: r.salesman_id,
          sale_date: r.sale_date,
          quantity: Number(r.quantity || 0),
          rate: r.rate === "" ? null : Number(r.rate),
          sales_value: Number(r.sales_value || 0),
          invoice_number: r.invoice_number || null,
          remarks: r.remarks || null,
        }));
        for (const p of payload) {
          if (!p.product_id || !p.party_id || !p.salesman_id) {
            throw new Error("Product, party and salesman are required on every row");
          }
        }
        await createSalesBatch(payload);
        setMessage(`${payload.length} sale(s) saved`);
        setRows([emptyRow(companies[0]?.id || "")]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const companyProducts = useMemo(() => products, [products]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2">Company</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Party</th>
              <th className="px-2 py-2">Salesman</th>
              <th className="px-2 py-2">Qty</th>
              <th className="px-2 py-2">Rate</th>
              <th className="px-2 py-2">Value</th>
              <th className="px-2 py-2">Invoice</th>
              <th className="px-2 py-2">Remarks</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const prods = companyProducts.filter((p) => p.company_id === r.company_id);
              const pts = parties.filter((p) => p.company_id === r.company_id);
              const sms = salesmen.filter((s) => s.company_id === r.company_id);
              return (
                <tr key={r.key} className="border-t border-[var(--border)]">
                  <td className="px-2 py-2">
                    <select
                      className={field}
                      value={r.company_id}
                      onChange={(e) =>
                        update(r.key, {
                          company_id: e.target.value,
                          product_id: "",
                          party_id: "",
                          salesman_id: "",
                        })
                      }
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      className={field}
                      value={r.sale_date}
                      onChange={(e) => update(r.key, { sale_date: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className={field}
                      value={r.product_id}
                      onChange={(e) => update(r.key, { product_id: e.target.value })}
                    >
                      <option value="">Product</option>
                      {prods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.product_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className={field}
                      value={r.party_id}
                      onChange={(e) => update(r.key, { party_id: e.target.value })}
                    >
                      <option value="">Party</option>
                      {pts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.party_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className={field}
                      value={r.salesman_id}
                      onChange={(e) => update(r.key, { salesman_id: e.target.value })}
                    >
                      <option value="">Salesman</option>
                      {sms.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={field}
                      type="number"
                      min="0"
                      step="0.001"
                      value={r.quantity}
                      onChange={(e) => update(r.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={field}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.rate}
                      onChange={(e) => update(r.key, { rate: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={field}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.sales_value}
                      onChange={(e) => update(r.key, { sales_value: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={field}
                      value={r.invoice_number}
                      onChange={(e) =>
                        update(r.key, { invoice_number: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      className={field}
                      value={r.remarks}
                      onChange={(e) => update(r.key, { remarks: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() =>
                        setRows((prev) =>
                          prev.length === 1
                            ? prev
                            : prev.filter((x) => x.key !== r.key)
                        )
                      }
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            setRows((prev) => [...prev, emptyRow(companies[0]?.id || "")])
          }
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium"
        >
          Add row
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save sales"}
        </button>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
    </div>
  );
}
