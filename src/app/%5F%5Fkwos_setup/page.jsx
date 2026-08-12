// ============================================================================
// 09_setup_wizard.jsx
// A hidden, one-time setup page. Route suggestion: app/__kwos_setup/page.jsx
// Protected by the SAME DEV_OVERRIDE_KEY already in Netlify env vars — no
// second secret to manage. Opens once, fill the form, click one button,
// all 5 users get created automatically. No UUIDs, no SQL, no copy-paste.
// ============================================================================
"use client";
import { useState } from "react";

const DEFAULT_ROWS = [
  { loginSlug: "admin",        displayName: "Admin",             role: "admin",      tempPin: "1234" },
  { loginSlug: "ceo-kailash",  displayName: "Kailash Kalyani",    role: "ceo",        tempPin: "2345" },
  { loginSlug: "accountant",   displayName: "Bharat Bhai",        role: "accountant", tempPin: "3456" },
  { loginSlug: "salesman-1",   displayName: "Salesman 01",        role: "salesman",   tempPin: "4567" },
  { loginSlug: "salesman-2",   displayName: "Salesman 02",        role: "salesman",   tempPin: "5678" },
];

export default function SetupWizard() {
  const [devKey, setDevKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [results, setResults] = useState({}); // loginSlug -> 'ok' | 'error' | 'pending'
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateRow = (i, field, value) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dev-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: devKey }),
        signal: AbortSignal.timeout(15000),
      });
      const rawBody = await res.text();
      // Temporary debug — remove after confirming unlock works end-to-end
      console.log("[__kwos_setup verify] status=", res.status, "body=", rawBody);
      let data = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        throw new Error(`Invalid response (${res.status}): ${rawBody.slice(0, 120)}`);
      }
      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || (res.status === 503
            ? "DEV_OVERRIDE_KEY not configured on server."
            : "Invalid developer key.")
        );
      }
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid developer key.");
    } finally {
      setBusy(false);
    }
  };

  const createAll = async () => {
    setRunning(true);
    const nextResults = {};
    try {
      for (const row of rows) {
        nextResults[row.loginSlug] = "pending";
        setResults({ ...nextResults });
        try {
          const res = await fetch("/api/admin-create-user", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-dev-key": devKey },
            body: JSON.stringify(row),
          });
          const data = await res.json();
          nextResults[row.loginSlug] = res.ok ? "ok" : `error: ${data.error || "unknown"}`;
        } catch (e) {
          nextResults[row.loginSlug] = `error: ${e.message}`;
        }
        setResults({ ...nextResults });
      }
      setDone(true);
    } finally {
      setRunning(false);
    }
  };

  if (!unlocked) {
    return (
      <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <p style={{ color: "#8a8296", fontSize: 11, letterSpacing: 1 }}>ONE-TIME SETUP</p>
          <p style={{ color: "#eee", fontSize: 13, margin: "10px 0" }}>Enter the same DEV_OVERRIDE_KEY you set in Netlify.</p>
          <input
            type="password" placeholder="Developer key" value={devKey}
            onChange={(e) => setDevKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && devKey && verify()}
            style={{ width: "100%", padding: 12, borderRadius: 10, marginBottom: 10, textAlign: "center" }}
          />
          {error && <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <button type="button" onClick={verify} disabled={busy || !devKey}
            style={{ width: "100%", padding: 12, borderRadius: 10, background: "#c6972e", fontWeight: 700 }}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#faf7ee", padding: 20 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Create your 5 users</h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
          Edit names/PINs if you like, or leave the defaults. Click Create — everything (login account + role) gets set up in one go.
        </p>

        {rows.map((row, i) => (
          <div key={row.loginSlug} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 90px", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input value={row.displayName} onChange={(e) => updateRow(i, "displayName", e.target.value)}
              placeholder="Display name" style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
            <select value={row.role} onChange={(e) => updateRow(i, "role", e.target.value)}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}>
              {["admin", "ceo", "accountant", "salesman"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input value={row.tempPin} maxLength={4} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && updateRow(i, "tempPin", e.target.value)}
              placeholder="Temp PIN" style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
            <span style={{ fontSize: 12, textAlign: "center", fontWeight: 700, color: results[row.loginSlug] === "ok" ? "#3e7c63" : results[row.loginSlug]?.startsWith("error") ? "#b5502e" : "#999" }}>
              {results[row.loginSlug] === "ok" ? "✓ Done" : results[row.loginSlug] === "pending" ? "…" : results[row.loginSlug]?.startsWith("error") ? "Failed" : ""}
            </span>
          </div>
        ))}

        <button onClick={createAll} disabled={running}
          style={{ width: "100%", padding: 14, borderRadius: 12, background: "#c6972e", fontWeight: 700, marginTop: 12 }}>
          {running ? "Creating…" : "Create All Users"}
        </button>

        {done && (
          <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 12, border: "1px solid #e4dac4" }}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>Save these temporary PINs — share one with each person:</p>
            {rows.map((r) => (
              <p key={r.loginSlug} style={{ fontSize: 13, margin: "4px 0" }}>
                <b>{r.displayName}</b> ({r.role}) — temp PIN: <code>{r.tempPin}</code>
              </p>
            ))}
            <p style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
              Everyone will be asked to set their own permanent PIN the first time they log in.
              You can delete this page&apos;s route once done, or leave it — it&apos;s hidden and key-protected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
