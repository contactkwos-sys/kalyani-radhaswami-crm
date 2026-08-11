"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { upsertProduct } from "@/lib/masters/actions";
import type { Company } from "@/types/database";
import type { Product } from "@/types/masters";

export function ProductForm({
  companies,
  product,
}: {
  companies: Company[];
  product?: Product | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    setError(null);
    startTransition(async () => {
      try {
        const saved = await upsertProduct(payload, product?.id);
        router.push(`/products/${saved.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Company</span>
        <select
          name="company_id"
          required
          defaultValue={product?.company_id || companies[0]?.id}
          className={field}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Product Code</span>
          <input
            name="product_code"
            required
            defaultValue={product?.product_code}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Product Name</span>
          <input
            name="product_name"
            required
            defaultValue={product?.product_name}
            className={field}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <input
            name="category"
            defaultValue={product?.category || ""}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Unit</span>
          <input
            name="unit"
            required
            defaultValue={product?.unit || "KG"}
            className={field}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Description</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={product?.description || ""}
          className={field}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Sales Rate</span>
          <input
            name="sales_rate"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.sales_rate ?? 0}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Target</span>
          <input
            name="monthly_target"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.monthly_target ?? 0}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Incentive %</span>
          <input
            name="incentive_percent"
            type="number"
            step="0.001"
            min="0"
            max="100"
            required
            defaultValue={product?.incentive_percent ?? 0}
            className={field}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Notes</span>
        <textarea
          name="notes"
          rows={2}
          defaultValue={product?.notes || ""}
          className={field}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Status</span>
        <select
          name="status"
          defaultValue={product?.status || "ACTIVE"}
          className={field}
        >
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
        </select>
      </label>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : product ? "Update Product" : "Create Product"}
      </button>
    </form>
  );
}
