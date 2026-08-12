"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPinForm() {
  const [mobile, setMobile] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Unable to submit request.");
        return;
      }
      setMessage(
        data.message ||
          "If this mobile is registered, a secure PIN reset request was submitted."
      );
    } catch {
      setError("Unable to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <p className="text-sm text-[var(--muted)]">
        Enter your registered mobile number. Your existing PIN is never shown.
        An Admin or Owner must issue a new temporary PIN.
      </p>
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
        disabled={loading || !mobile}
        className="rounded-md bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:opacity-60"
      >
        {loading ? "Submitting…" : "Request PIN reset"}
      </button>
      <Link
        href="/login"
        className="text-center text-sm font-medium text-[var(--accent)] hover:underline"
      >
        Back to Login
      </Link>
    </form>
  );
}
