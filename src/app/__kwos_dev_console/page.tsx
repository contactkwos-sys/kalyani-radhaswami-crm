"use client";

import { useState } from "react";

/**
 * Hidden diagnostic console — not linked in any nav.
 * Route: /__kwos_dev_console
 *
 * Netlify functions:
 *   api/dev-verify.js
 *   api/admin-create-user.js
 *
 * Env vars (Netlify dashboard):
 *   DEV_OVERRIDE_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */
export default function DevConsoleAccessPage() {
  const [key, setKey] = useState("");
  const [loginSlug, setLoginSlug] = useState("admin");
  const [displayName, setDisplayName] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [role, setRole] = useState("admin");
  const [sortOrder, setSortOrder] = useState(10);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function post(pathNetlify: string, pathNext: string, payload: unknown) {
    let r = await fetch(pathNetlify, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!r) {
      r = await fetch(pathNext, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    return r;
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const r = await post("/.netlify/functions/dev-verify", "/api/dev-verify", {
      key,
    });
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
    const payload = { key, loginSlug, displayName, role, tempPin, sortOrder };
    const r = await post(
      "/.netlify/functions/admin-create-user",
      "/api/admin-create-user",
      payload
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(data.error || "Create failed");
      return;
    }
    setMsg(
      `Created ${data.loginSlug} → ${data.email} (${data.id}). Temp PIN: ${data.tempPinShownOnce}. Give once, then user sets own PIN.`
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
        <form
          onSubmit={createUser}
          className="mt-8 space-y-3 border-t border-[var(--border)] pt-6"
        >
          <h2 className="text-lg font-semibold">Create role-tile user</h2>
          <input
            placeholder="login_slug (e.g. admin, ceo, salesman_01)"
            value={loginSlug}
            onChange={(e) => setLoginSlug(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <input
            placeholder="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <input
            placeholder="Temporary 4-digit PIN"
            inputMode="numeric"
            maxLength={4}
            value={tempPin}
            onChange={(e) =>
              setTempPin(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
            required
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          >
            <option value="admin">Admin</option>
            <option value="ceo">CEO (Kailash Kalyani)</option>
            <option value="accountant">Accountant</option>
            <option value="salesman">Salesman</option>
          </select>
          <input
            type="number"
            placeholder="Sort order"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2"
          />
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
