"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mobile-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile, pin, remember }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid mobile number or PIN.");
        setLoading(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--ink)]">
          Mobile Number
        </label>
        <input
          type="tel"
          inputMode="numeric"
          required
          autoComplete="tel"
          placeholder="10-digit mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-3 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--ink)]">
          PIN
        </label>
        <input
          type="password"
          inputMode="numeric"
          required
          autoComplete="one-time-code"
          maxLength={8}
          placeholder="4–8 digit PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-3 text-base tracking-[0.3em] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Remember this device
      </label>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={loading || !mobile || pin.length < 4}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Login"}
      </button>
    </form>
  );
}
