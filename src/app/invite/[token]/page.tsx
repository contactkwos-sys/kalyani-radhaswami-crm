"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          pin,
          remember,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid invite or PIN.");
        setLoading(false);
        return;
      }
      router.replace(data.home || "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to accept invite. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Kalyani · Radhaswami
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          Accept invite
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Enter the temporary PIN shared by your Admin. This invite link is
          single-use and expires automatically.
        </p>
        <label className="mt-5 block text-sm font-medium text-[var(--ink)]">
          Temporary PIN
          <input
            type="password"
            inputMode="numeric"
            required
            maxLength={8}
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-3 tracking-[0.3em]"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--ink)]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember this device
        </label>
        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || pin.length < 4}
          className="mt-5 w-full rounded-md bg-[var(--accent)] px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Opening…" : "Activate account"}
        </button>
      </form>
    </div>
  );
}
