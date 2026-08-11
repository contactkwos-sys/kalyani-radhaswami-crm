"use client";

import { useEffect, useState } from "react";

export function OwnerPinForm() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/security/owner-pin")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.configured)))
      .catch(() => setConfigured(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const res = await fetch("/api/security/owner-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPin, newPin, confirmPin }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to update PIN");
      return;
    }
    setMessage(data.message);
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setConfigured(true);
  }

  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold text-[var(--ink)]">Owner Access</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Change the Owner Override PIN. The current PIN is never displayed.
        {configured === false && (
          <span className="mt-1 block text-amber-700">
            PIN is not configured yet. Set it now using your bootstrap PIN as
            Current PIN (if provided), otherwise enter any Current PIN for
            first-time setup when no bootstrap secret exists.
          </span>
        )}
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Current PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">New PIN</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="\d{4,8}"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Confirm New PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            required
            pattern="\d{4,8}"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
        </div>
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
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Saving…" : "Change PIN"}
        </button>
      </form>
    </div>
  );
}
