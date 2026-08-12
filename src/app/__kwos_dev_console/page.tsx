"use client";

import { useState } from "react";

/**
 * Hidden diagnostic console — not linked in any nav.
 * Route: /__kwos_dev_console
 *
 * Netlify functions extracted below as real files:
 *   api/dev-verify.js
 *   api/admin-create-user.js
 *
 * Env vars (set in Netlify dashboard):
 *   DEV_OVERRIDE_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 */
export default function DevConsoleAccessPage() {
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const res = await fetch("/.netlify/functions/dev-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }).catch(() => null);

    // Fallback to Next route if Netlify function path unavailable locally
    const r =
      res ||
      (await fetch("/api/dev-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      }));

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(data.error || "Invalid key");
      setOk(false);
      return;
    }
    setOk(true);
    setMsg("Developer key accepted.");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const payload = { key, email, password, fullName, role };
    let r = await fetch("/.netlify/functions/admin-create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!r) {
      r = await fetch("/api/admin-create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(data.error || "Create failed");
      return;
    }
    setMsg(
      `Created ${data.email || email} (${data.id || "ok"}). Insert app_users row next.`
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Diagnostic
      </p>
      <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold">
        KWOS Dev Console
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Not linked in navigation. Requires{" "}
        <code className="font-mono text-xs">DEV_OVERRIDE_KEY</code>.
      </p>

      <form onSubmit={verify} className="mt-6 space-y-3">
        <label className="block text-sm font-medium">
          DEV_OVERRIDE_KEY
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white"
        >
          Verify key
        </button>
      </form>

      {ok && (
        <form onSubmit={createUser} className="mt-8 space-y-3 border-t border-[var(--border)] pt-6">
          <h2 className="text-lg font-semibold">Create auth user</h2>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <input
            placeholder="Temporary password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <input
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          >
            <option value="ADMIN">Admin</option>
            <option value="CEO_1">CEO (Kailash Kalyani)</option>
            <option value="ACCOUNTANT">Accountant</option>
            <option value="SALESMAN">Salesman</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Create user
          </button>
        </form>
      )}

      {err && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      )}
      {msg && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      )}
    </div>
  );
}
