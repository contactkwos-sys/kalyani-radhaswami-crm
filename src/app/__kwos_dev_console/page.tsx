"use client";

// ============================================================================
// 05_dev_console_access.jsx
// Hidden developer diagnostic route. NOT linked from any nav/menu, NOT a row
// in app_users, NEVER shows up in the client's Users management screen, and
// carries no personal name — it's pure env-var + server verification.
//
// Route suggestion: app/__kwos_dev_console/page.jsx
// (double underscore prefix keeps it out of normal URL guessing/crawling —
// pair this with a robots.txt disallow rule too).
// ============================================================================
import { useState } from "react";

export default function DevConsoleAccess() {
  const [key, setKey] = useState("");
  const [granted, setGranted] = useState(false);
  const [viewAsRole, setViewAsRole] = useState("admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true); setError("");
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

  if (!granted) {
    return (
      <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <p style={{ color: "#8a8296", fontSize: 11, letterSpacing: 1 }}>KWOS DIAGNOSTIC ACCESS</p>
          <input
            type="password" placeholder="Developer override key" value={key}
            onChange={(e) => setKey(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, marginTop: 16, marginBottom: 10, textAlign: "center" }}
          />
          {error && <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 8 }}>{error}</p>}
          <button type="button" onClick={verify} disabled={busy || !key}
            style={{ width: "100%", padding: 12, borderRadius: 10, background: "#c6972e", fontWeight: 700 }}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  // Read-only "view as role" preview — does NOT log in as a real user, does
  // NOT touch app_users, purely renders each dashboard in a preview frame
  // so you can visually check for bugs without needing anyone's real PIN.
  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#eee", padding: 20 }}>
      <p style={{ fontSize: 12, color: "#8a8296", marginBottom: 10 }}>Diagnostic preview — read-only, no real session created.</p>
      <select value={viewAsRole} onChange={(e) => setViewAsRole(e.target.value)}
        style={{ padding: 8, borderRadius: 8, marginBottom: 16 }}>
        {["admin", "ceo", "accountant", "salesman"].map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <iframe
        src={`/preview/${viewAsRole}`}
        title="role preview"
        style={{ width: "100%", height: "80vh", border: "1px solid #333", borderRadius: 12 }}
      />
    </div>
  );
}
