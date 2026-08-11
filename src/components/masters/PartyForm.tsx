"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { upsertParty } from "@/lib/masters/actions";
import type { Company } from "@/types/database";
import type { Party } from "@/types/masters";
import { PARTY_STATUSES } from "@/types/masters";

export function PartyForm({
  companies,
  party,
}: {
  companies: Company[];
  party?: Party | null;
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
        const saved = await upsertParty(payload, party?.id);
        router.push(`/parties/${saved.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-white px-3 py-2";

  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Company</span>
        <select
          name="company_id"
          required
          defaultValue={party?.company_id || companies[0]?.id}
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
          <span className="mb-1 block font-medium">Party Code</span>
          <input
            name="party_code"
            required
            defaultValue={party?.party_code}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Party Name</span>
          <input
            name="party_name"
            required
            defaultValue={party?.party_name}
            className={field}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Contact Person</span>
          <input
            name="contact_person"
            defaultValue={party?.contact_person || ""}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mobile</span>
          <input
            name="mobile"
            defaultValue={party?.mobile || ""}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">WhatsApp</span>
          <input
            name="whatsapp"
            defaultValue={party?.whatsapp || ""}
            className={field}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Address</span>
        <textarea
          name="address"
          rows={2}
          defaultValue={party?.address || ""}
          className={field}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Area</span>
          <input name="area" defaultValue={party?.area || ""} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">City</span>
          <input name="city" defaultValue={party?.city || ""} className={field} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Latitude</span>
          <input
            name="latitude"
            type="number"
            step="0.0000001"
            defaultValue={party?.latitude ?? ""}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Longitude</span>
          <input
            name="longitude"
            type="number"
            step="0.0000001"
            defaultValue={party?.longitude ?? ""}
            className={field}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Current Supplier</span>
          <input
            name="current_supplier"
            defaultValue={party?.current_supplier || ""}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Potential Monthly Business</span>
          <input
            name="potential_monthly_business"
            type="number"
            step="0.01"
            min="0"
            defaultValue={party?.potential_monthly_business ?? 0}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Current Business</span>
          <input
            name="current_business"
            type="number"
            step="0.01"
            min="0"
            defaultValue={party?.current_business ?? 0}
            className={field}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Status</span>
        <select
          name="status"
          defaultValue={party?.status || "NEW"}
          className={field}
        >
          {PARTY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
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
        {pending ? "Saving…" : party ? "Update Party" : "Create Party"}
      </button>
    </form>
  );
}
