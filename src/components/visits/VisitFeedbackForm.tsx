"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveVisitFeedback } from "@/lib/visits/actions";

export function VisitFeedbackForm({
  visitId,
  products,
}: {
  visitId: string;
  products: Array<{ id: string; product_name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    payload.visit_id = visitId;
    payload.sample_required = fd.get("sample_required") === "on";
    payload.sample_given = fd.get("sample_given") === "on";
    payload.trial_required = fd.get("trial_required") === "on";
    setError(null);
    startTransition(async () => {
      try {
        await saveVisitFeedback(payload);
        router.push(`/visits/${visitId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Person Met</span>
          <input name="person_met" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Designation</span>
          <input name="designation" className={field} />
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Discussion</span>
        <textarea name="discussion" rows={3} className={field} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Product Discussed</span>
        <select name="product_id" className={field} defaultValue="">
          <option value="">—</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.product_name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Potential Qty</span>
          <input name="potential_quantity" type="number" step="0.001" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Potential Monthly Business</span>
          <input name="potential_monthly_business" type="number" step="0.01" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Current Supplier</span>
          <input name="current_supplier" className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Current Rate</span>
          <input name="current_rate" type="number" step="0.01" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Our Rate</span>
          <input name="our_rate" type="number" step="0.01" className={field} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="sample_required" /> Sample Required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="sample_given" /> Sample Given
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="trial_required" /> Trial Required
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Trial Date</span>
          <input name="trial_date" type="date" className={field} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Probability</span>
          <select name="probability" className={field} defaultValue="">
            <option value="">—</option>
            <option value="P10">10%</option>
            <option value="P25">25%</option>
            <option value="P50">50%</option>
            <option value="P75">75%</option>
            <option value="P90">90%</option>
            <option value="CONVERTED">CONVERTED</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Reason for Not Converting</span>
          <select name="reason_not_converting" className={field} defaultValue="">
            <option value="">—</option>
            <option value="PRICE">Price</option>
            <option value="QUALITY">Quality</option>
            <option value="EXISTING_SUPPLIER">Existing Supplier</option>
            <option value="CREDIT">Credit</option>
            <option value="NO_REQUIREMENT">No Requirement</option>
            <option value="COMPETITOR">Competitor</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block font-medium">Remarks</span>
        <textarea name="remarks" rows={2} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Photo URL</span>
          <input name="photo_url" type="url" className={field} placeholder="https://..." />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Voice Note URL</span>
          <input name="voice_note_url" type="url" className={field} placeholder="https://..." />
        </label>
      </div>
      <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
        <p className="text-sm font-medium">Next Follow-up</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <input name="followup_date" type="date" className={field} />
          <input
            name="followup_purpose"
            placeholder="Purpose"
            className={field}
          />
          <select name="followup_priority" className={field} defaultValue="MEDIUM">
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>
      </div>
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
        {pending ? "Saving…" : "Save Feedback"}
      </button>
    </form>
  );
}
