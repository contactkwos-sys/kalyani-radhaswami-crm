"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { upsertSalesman } from "@/lib/masters/actions";
import type { Company } from "@/types/database";
import type { Salesman, Territory } from "@/types/masters";

export function SalesmanForm({
  companies,
  territories,
  salesman,
}: {
  companies: Company[];
  territories: Territory[];
  salesman?: Salesman | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    setError(null);
    startTransition(async () => {
      try {
        const saved = await upsertSalesman(payload, salesman?.id);
        router.push(`/salesmen/${saved.id}`);
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
          defaultValue={salesman?.company_id || companies[0]?.id}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
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
          <span className="mb-1 block font-medium">Employee ID</span>
          <input
            name="employee_id"
            required
            defaultValue={salesman?.employee_id}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input
            name="name"
            required
            defaultValue={salesman?.name}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mobile</span>
          <input
            name="mobile"
            defaultValue={salesman?.mobile || ""}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Photo URL</span>
          <input
            name="photo_url"
            type="url"
            defaultValue={salesman?.photo_url || ""}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Territory</span>
          <select
            name="territory_id"
            defaultValue={salesman?.territory_id || ""}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="">—</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Joining Date</span>
          <input
            name="joining_date"
            type="date"
            defaultValue={salesman?.joining_date || ""}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Monthly Target</span>
          <input
            name="monthly_target"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={salesman?.monthly_target ?? 0}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select
            name="status"
            defaultValue={salesman?.status || "ACTIVE"}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Incentive Rule</span>
        <textarea
          name="incentive_rule"
          rows={2}
          defaultValue={salesman?.incentive_rule || ""}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
        />
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
        {pending ? "Saving…" : salesman ? "Update Salesman" : "Create Salesman"}
      </button>
    </form>
  );
}
