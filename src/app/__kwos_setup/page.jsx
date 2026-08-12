"use client";

// ============================================================================
// 09_setup_wizard.jsx
// One-time hidden setup wizard: create auth + app_users rows without SQL /
// UUID copy-paste. Calls /api/admin-create-user with header x-dev-key.
//
// Route: app/__kwos_setup/page.jsx
// (double underscore — keep out of nav + robots.txt disallow)
// ============================================================================
import { useMemo, useState } from "react";

const ROLES = ["admin", "ceo", "accountant", "salesman"];

const DEFAULT_ROWS = [
  { loginSlug: "admin", displayName: "Admin", role: "admin", tempPin: "1234", sortOrder: 10 },
  { loginSlug: "ceo", displayName: "CEO (Kailash Kalyani)", role: "ceo", tempPin: "1234", sortOrder: 20 },
  { loginSlug: "accountant", displayName: "Accountant", role: "accountant", tempPin: "1234", sortOrder: 30 },
  { loginSlug: "salesman_01", displayName: "Salesman 01", role: "salesman", tempPin: "1234", sortOrder: 40 },
  { loginSlug: "salesman_02", displayName: "Salesman 02", role: "salesman", tempPin: "1234", sortOrder: 50 },
];

export default function SetupWizardPage() {
  const [key, setKey] = useState("");
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [results, setResults] = useState([]);

  const canCreate = useMemo(
    () => rows.every((r) => r.loginSlug && r.displayName && r.role && /^\d{4}$/.test(r.tempPin)),
    [rows]
  );

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dev-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("Invalid developer key.");
      setGranted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid developer key.");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const createAll = async () => {
    setBusy(true);
    setError("");
    const out = [];
    try {
      for (const r of rows) {
        const res = await fetch("/api/admin-create-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-key": key,
          },
          body: JSON.stringify({
            loginSlug: r.loginSlug.trim().toLowerCase(),
            displayName: r.displayName.trim(),
            role: r.role,
            tempPin: r.tempPin,
            sortOrder: r.sortOrder,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          out.push({ slug: r.loginSlug, ok: false, error: data.error || res.statusText });
        } else {
          out.push({ slug: r.loginSlug, ok: true, id: data.id });
        }
      }
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!granted) {
    return (
      <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
          <p style={{ color: "#8a8296", fontSize: 11, letterSpacing: 1 }}>KWOS ONE-TIME SETUP</p>
          <p style={{ color: "#cfc8d8", fontSize: 13, marginTop: 8 }}>
            Create login tiles without SQL or UUID paste.
          </p>
          <input
            type="password"
            placeholder="Developer override key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, marginTop: 16, marginBottom: 10, textAlign: "center" }}
          />
          {error && <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <button
            type="button"
            onClick={verify}
            disabled={busy || !key}
            style={{ width: "100%", padding: 12, borderRadius: 10, background: "#c6972e", fontWeight: 700 }}
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#eee", padding: 20 }}>
      <p style={{ fontSize: 12, color: "#8a8296", marginBottom: 6 }}>KWOS SETUP WIZARD</p>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Create login users</h1>
      <p style={{ fontSize: 13, color: "#cfc8d8", marginBottom: 16, maxWidth: 640 }}>
        Each row creates the Supabase Auth user and matching <code>app_users</code> row in one call.
        Give each person their temporary 4-digit PIN; they set their own PIN on first login.
      </p>

      <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
        {rows.map((r, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1.4fr 1fr 0.7fr",
              gap: 8,
              padding: 12,
              border: "1px solid #333",
              borderRadius: 12,
              background: "#1a1a1a",
            }}
          >
            <input
              value={r.loginSlug}
              onChange={(e) => updateRow(idx, { loginSlug: e.target.value })}
              placeholder="login_slug"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #444", background: "#111", color: "#eee" }}
            />
            <input
              value={r.displayName}
              onChange={(e) => updateRow(idx, { displayName: e.target.value })}
              placeholder="Display name"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #444", background: "#111", color: "#eee" }}
            />
            <select
              value={r.role}
              onChange={(e) => updateRow(idx, { role: e.target.value })}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #444", background: "#111", color: "#eee" }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <input
              value={r.tempPin}
              onChange={(e) => updateRow(idx, { tempPin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="PIN"
              inputMode="numeric"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #444", background: "#111", color: "#eee", textAlign: "center", letterSpacing: 2 }}
            />
          </div>
        ))}
      </div>

      {error && <p style={{ color: "#e38a8a", fontSize: 13, marginTop: 12 }}>{error}</p>}

      <button
        type="button"
        onClick={createAll}
        disabled={busy || !canCreate}
        style={{
          marginTop: 16,
          padding: "12px 18px",
          borderRadius: 10,
          background: canCreate ? "#c6972e" : "#555",
          color: "#111",
          fontWeight: 700,
          border: "none",
        }}
      >
        {busy ? "Creating…" : "Create all users"}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: 20, maxWidth: 640 }}>
          <p style={{ fontSize: 12, color: "#8a8296", marginBottom: 8 }}>Results</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {results.map((r) => (
              <li
                key={r.slug}
                style={{
                  padding: "8px 10px",
                  marginBottom: 6,
                  borderRadius: 8,
                  background: r.ok ? "#14352c" : "#3a1c1c",
                  color: r.ok ? "#9fd6c2" : "#e38a8a",
                  fontSize: 13,
                }}
              >
                {r.ok ? `✓ ${r.slug}` : `✗ ${r.slug}: ${r.error}`}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12, color: "#8a8296", marginTop: 12 }}>
            After success, open <a href="/login" style={{ color: "#c6972e" }}>/login</a> and sign in with each temp PIN.
          </p>
        </div>
      )}
    </div>
  );
}
