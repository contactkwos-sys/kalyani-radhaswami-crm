"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDailyPlan } from "@/lib/visits/actions";

export function DailyPlanForm({
  salesmanId,
  parties,
  planDate,
  existingPartyIds = [],
  existingTarget = 0,
}: {
  salesmanId: string;
  parties: Array<{ id: string; party_name: string; party_code: string }>;
  planDate: string;
  existingPartyIds?: string[];
  existingTarget?: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(existingPartyIds);
  const [target, setTarget] = useState(existingTarget);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        await createDailyPlan({
          salesman_id: salesmanId,
          plan_date: planDate,
          daily_sales_target: target,
          party_ids: selected,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save plan");
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <input
            value={planDate}
            readOnly
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Daily Sales Target (₹)</span>
          <input
            type="number"
            min={0}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2"
          />
        </label>
      </div>
      <div>
        <p className="text-sm font-medium">
          Planned Parties: {selected.length}
        </p>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2">
          {parties.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span>
                {p.party_name}{" "}
                <span className="text-[var(--muted)]">({p.party_code})</span>
              </span>
            </label>
          ))}
          {parties.length === 0 && (
            <p className="p-2 text-sm text-[var(--muted)]">
              No assigned parties. Ask Owner to assign parties first.
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save Daily Plan"}
      </button>
    </div>
  );
}
