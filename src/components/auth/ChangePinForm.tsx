"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePinForm() {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin, confirmPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to change PIN.");
        setLoading(false);
        return;
      }
      setMessage(data.message || "PIN updated.");
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to change PIN.");
      setLoading(false);
    }
  }

  const field =
    "mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm tracking-[0.25em]";

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-3">
      <label className="block text-sm">
        Current PIN
        <input
          type="password"
          inputMode="numeric"
          required
          maxLength={8}
          value={currentPin}
          onChange={(e) =>
            setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 8))
          }
          className={field}
        />
      </label>
      <label className="block text-sm">
        New PIN
        <input
          type="password"
          inputMode="numeric"
          required
          maxLength={8}
          value={newPin}
          onChange={(e) =>
            setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))
          }
          className={field}
        />
      </label>
      <label className="block text-sm">
        Confirm New PIN
        <input
          type="password"
          inputMode="numeric"
          required
          maxLength={8}
          value={confirmPin}
          onChange={(e) =>
            setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))
          }
          className={field}
        />
      </label>
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
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Saving…" : "Change PIN"}
      </button>
    </form>
  );
}
