"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  assignPartyProduct,
  assignPartySalesman,
  assignSalesmanProduct,
  removePartySalesman,
  removeSalesmanProduct,
} from "@/lib/masters/actions";
import type { Company } from "@/types/database";
import type { Party, Product, Salesman } from "@/types/masters";

export function AssignmentPanel({
  companies,
  products,
  salesmen,
  parties,
  salesmanProducts,
  partySalesmen,
}: {
  companies: Company[];
  products: Product[];
  salesmen: Salesman[];
  parties: Party[];
  salesmanProducts: Array<{
    id: string;
    salesman_id: string;
    product_id: string;
    company_id: string;
    salesman?: { name: string } | null;
    product?: { product_name: string } | null;
  }>;
  partySalesmen: Array<{
    id: string;
    party_id: string;
    salesman_id: string;
    product_id: string | null;
    company_id: string;
    party?: { party_name: string } | null;
    salesman?: { name: string } | null;
    product?: { product_name: string } | null;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<unknown>, okMsg: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(okMsg);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Product → Salesman</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A product can have multiple salesmen.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const salesman_id = String(fd.get("salesman_id"));
            const product_id = String(fd.get("product_id"));
            const salesman = salesmen.find((s) => s.id === salesman_id);
            const product = products.find((p) => p.id === product_id);
            if (!salesman || !product) return;
            if (salesman.company_id !== product.company_id) {
              setError("Salesman and product must belong to the same company.");
              return;
            }
            run(
              () =>
                assignSalesmanProduct({
                  company_id: salesman.company_id,
                  salesman_id,
                  product_id,
                }),
              "Salesman assigned to product"
            );
          }}
        >
          <select name="product_id" required className={field}>
            <option value="">Product</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name} ({companies.find((c) => c.id === p.company_id)?.code})
              </option>
            ))}
          </select>
          <select name="salesman_id" required className={field}>
            <option value="">Salesman</option>
            {salesmen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
          >
            Assign
          </button>
        </form>
        <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
          {salesmanProducts.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {row.product?.product_name || row.product_id} →{" "}
                {row.salesman?.name || row.salesman_id}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => removeSalesmanProduct(row.id), "Assignment removed")
                }
                className="text-red-700 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Party → Product → Salesman</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Appoint a second salesman for the same product when required.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const party_id = String(fd.get("party_id"));
            const product_id = String(fd.get("product_id") || "");
            const salesman_id = String(fd.get("salesman_id"));
            const relation_type = String(fd.get("relation_type")) as
              | "USED"
              | "INTERESTED";
            const party = parties.find((p) => p.id === party_id);
            const salesman = salesmen.find((s) => s.id === salesman_id);
            if (!party || !salesman) return;
            run(async () => {
              if (product_id) {
                await assignPartyProduct({
                  company_id: party.company_id,
                  party_id,
                  product_id,
                  relation_type,
                });
              }
              await assignPartySalesman({
                company_id: party.company_id,
                party_id,
                salesman_id,
                product_id: product_id || null,
              });
            }, "Party assignment saved");
          }}
        >
          <select name="party_id" required className={field}>
            <option value="">Party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.party_name}
              </option>
            ))}
          </select>
          <select name="product_id" className={field}>
            <option value="">Product (optional)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name}
              </option>
            ))}
          </select>
          <select name="salesman_id" required className={field}>
            <option value="">Salesman</option>
            {salesmen.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="relation_type" className={field} defaultValue="INTERESTED">
            <option value="INTERESTED">INTERESTED</option>
            <option value="USED">USED</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white"
          >
            Assign
          </button>
        </form>
        <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
          {partySalesmen.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                {row.party?.party_name || row.party_id} ·{" "}
                {row.product?.product_name || "All products"} ·{" "}
                {row.salesman?.name || row.salesman_id}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => removePartySalesman(row.id), "Assignment removed")
                }
                className="text-red-700 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
