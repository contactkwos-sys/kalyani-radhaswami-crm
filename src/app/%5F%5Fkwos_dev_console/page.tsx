"use client";

/**
 * Hidden developer diagnostic route.
 * NOT linked from login/nav. Does NOT show developer personal name.
 * Credentials verified server-side only (override key or mobile + PIN hash).
 */
import { useState } from "react";

export default function DevConsoleAccess() {
  const [mode, setMode] = useState<"key" | "mobile">("key");
  const [key, setKey] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [granted, setGranted] = useState(false);
  const [viewAsRole, setViewAsRole] = useState("admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dev-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "key" ? { key } : { mobile, pin }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error("Invalid developer credentials.");
      setGranted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid developer credentials.");
    } finally {
      setBusy(false);
    }
  };

  if (!granted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#111",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
          <p style={{ color: "#8a8296", fontSize: 11, letterSpacing: 1 }}>
            TECHNICAL MAINTENANCE
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setMode("key")}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 8,
                background: mode === "key" ? "#333" : "#1a1a1a",
                color: "#ccc",
                border: "1px solid #333",
              }}
            >
              Override key
            </button>
            <button
              type="button"
              onClick={() => setMode("mobile")}
              style={{
                flex: 1,
                padding: 8,
                borderRadius: 8,
                background: mode === "mobile" ? "#333" : "#1a1a1a",
                color: "#ccc",
                border: "1px solid #333",
              }}
            >
              Mobile + PIN
            </button>
          </div>
          {mode === "key" ? (
            <input
              type="password"
              placeholder="Override key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                marginBottom: 10,
                textAlign: "center",
              }}
            />
          ) : (
            <>
              <input
                type="tel"
                placeholder="Mobile identifier"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 10,
                  textAlign: "center",
                }}
              />
              <input
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                autoComplete="off"
                inputMode="numeric"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 10,
                  marginBottom: 10,
                  textAlign: "center",
                }}
              />
            </>
          )}
          {error && (
            <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 8 }}>{error}</p>
          )}
          <button
            type="button"
            onClick={verify}
            disabled={
              busy ||
              (mode === "key" ? !key : mobile.length < 8 || pin.length < 4)
            }
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              background: "#2a6b4f",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#111", color: "#eee", padding: 20 }}>
      <p style={{ fontSize: 12, color: "#8a8296", marginBottom: 10 }}>
        Diagnostic preview — read-only, no real session created.
      </p>
      <select
        value={viewAsRole}
        onChange={(e) => setViewAsRole(e.target.value)}
        style={{ padding: 8, borderRadius: 8, marginBottom: 16 }}
      >
        {["admin", "ceo", "accountant", "salesman"].map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <iframe
        src={`/preview/${viewAsRole}`}
        title="role preview"
        style={{
          width: "100%",
          height: "80vh",
          border: "1px solid #333",
          borderRadius: 12,
        }}
      />
    </div>
  );
}
