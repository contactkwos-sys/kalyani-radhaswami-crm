"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Company } from "@/types/database";
import type { Product, Salesman, Party } from "@/types/masters";

export function ReportFiltersBar({
  companies,
  products,
  salesmen,
  parties,
  defaults,
}: {
  companies: Company[];
  products: Product[];
  salesmen: Salesman[];
  parties: Party[];
  defaults: {
    company?: string;
    product?: string;
    salesman?: string;
    party?: string;
    from?: string;
    to?: string;
    month?: string;
    fy?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(formData: FormData) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of [
      "company",
      "product",
      "salesman",
      "party",
      "from",
      "to",
      "month",
      "fy",
    ]) {
      const v = String(formData.get(key) || "");
      if (v) params.set(key, v);
      else params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm";

  return (
    <form
      action={apply}
      className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden"
    >
      <label className="text-xs">
        Company
        <select name="company" defaultValue={defaults.company || ""} className={field}>
          <option value="">All selected</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Product
        <select name="product" defaultValue={defaults.product || ""} className={field}>
          <option value="">All</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.product_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Salesman
        <select name="salesman" defaultValue={defaults.salesman || ""} className={field}>
          <option value="">All</option>
          {salesmen.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        Party
        <select name="party" defaultValue={defaults.party || ""} className={field}>
          <option value="">All</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.party_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        From
        <input type="date" name="from" defaultValue={defaults.from || ""} className={field} />
      </label>
      <label className="text-xs">
        To
        <input type="date" name="to" defaultValue={defaults.to || ""} className={field} />
      </label>
      <label className="text-xs">
        Month
        <input type="month" name="month" defaultValue={defaults.month || ""} className={field} />
      </label>
      <label className="text-xs">
        Financial year
        <input
          name="fy"
          placeholder="2025-26"
          defaultValue={defaults.fy || ""}
          className={field}
        />
      </label>
      <div className="sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Applying…" : "Apply filters"}
        </button>
      </div>
    </form>
  );
}
