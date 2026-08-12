"use client";

// ============================================================================
// 03_role_login_page.jsx
// Replaces the mobile-number + PIN login screen entirely. No mobile field,
// no OTP anywhere. Drop this in as your login route (e.g. app/login/page.jsx
// or pages/login.jsx — adjust the router import for your Next.js version).
// ============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; // Next 13+/14 app router.
// If this project uses the Pages router instead, swap to:
// import { useRouter } from "next/router";
import {
  listActiveUsers,
  loginWithPin,
  setInitialPin,
  getMyRole,
  ROLE_HOME,
  type ActiveUserTile,
} from "@/lib/auth/auth-lib";

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "16px 0" }}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14, height: 14, borderRadius: "50%",
            background: i < filled ? "#1f6f5c" : "#e4dac4",
            transition: "background 0.15s",
          }}
        />
      ))}
    </div>
  );
}

function PinPad({
  onDigit,
  onBackspace,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  const keys = ["1","2","3","4","5","6","7","8","9","","0","back"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 20 }}>
      {keys.map((k, i) =>
        k === "" ? <div key={i} /> : (
          <button
            key={i}
            type="button"
            onClick={() => (k === "back" ? onBackspace() : onDigit(k))}
            style={{
              height: 56, borderRadius: 14, border: "1px solid #e4dac4",
              background: "#fff", fontSize: 18, fontWeight: 700,
            }}
          >
            {k === "back" ? "⌫" : k}
          </button>
        )
      )}
    </div>
  );
}

export default function RoleLoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ActiveUserTile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<ActiveUserTile | null>(null); // the chosen role tile
  const [mode, setMode] = useState<"pin" | "setpin">("pin");        // 'pin' | 'setpin'
  const [pin, setPin] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listActiveUsers()
      .then((data) => setUsers(data))
      .catch((err) => {
        console.log(err);
        setError(`Could not load users: ${err.message || JSON.stringify(err)}`);
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  const pickUser = (u: ActiveUserTile) => {
    setSelected(u);
    setMode(u.pin_is_set ? "pin" : "setpin");
    setPin(""); setTempPin(""); setNewPin(""); setConfirmPin(""); setError("");
  };

  const goToRoleHome = async () => {
    const role = await getMyRole();
    router.replace(ROLE_HOME[role] || "/");
  };

  const submitPin = async (nextPin: string) => {
    setPin(nextPin);
    if (nextPin.length !== 4) return;
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await loginWithPin(selected.login_slug, nextPin);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect PIN.");
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const submitSetPin = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await setInitialPin(selected.login_slug, tempPin, newPin, confirmPin);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set PIN.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Screen 1: pick a role tile ------------------------------------
  if (!selected) {
    return (
      <div style={{ minHeight: "100vh", background: "#221a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <p style={{ color: "#e9c979", fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>SALES FORCE CRM</p>
            <h1 style={{ color: "#f7f2e7", fontSize: 24, fontWeight: 700, margin: "4px 0" }}>Kalyani · Radhaswami</h1>
            <p style={{ color: "#8a8296", fontSize: 12, marginTop: 10 }}>Select your name to sign in</p>
          </div>
          {loadingUsers && <p style={{ color: "#8a8296", textAlign: "center" }}>Loading…</p>}
          {error && <p style={{ color: "#e38a8a", textAlign: "center", marginBottom: 12 }}>{error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 16,
                  background: "rgba(247,242,231,0.05)", border: "1px solid rgba(247,242,231,0.12)",
                  textAlign: "left", color: "#f7f2e7",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "#7c2142", color: "#fff", fontWeight: 700, fontSize: 13,
                }}>
                  {u.display_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{u.display_name}</p>
                  <p style={{ fontSize: 11, color: "#c6972e", textTransform: "capitalize" }}>{u.role}</p>
                </div>
              </button>
            ))}
          </div>
          <p style={{ textAlign: "center", color: "#8a8296", fontSize: 10.5, marginTop: 20 }}>No OTP · PIN login only</p>
        </div>
      </div>
    );
  }

  // ---- Screen 2a: first-time "Set your PIN" ---------------------------
  if (mode === "setpin") {
    return (
      <div style={{ minHeight: "100vh", background: "#221a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
          <button type="button" onClick={() => setSelected(null)} style={{ color: "#e9c979", fontSize: 12, marginBottom: 20 }}>← Change user</button>
          <p style={{ color: "#f7f2e7", fontWeight: 700, fontSize: 16 }}>{selected.display_name}</p>
          <p style={{ color: "#8a8296", fontSize: 12, marginBottom: 16 }}>Set your PIN — first time login</p>

          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="Temporary PIN"
            value={tempPin} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setTempPin(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #444", marginBottom: 10, textAlign: "center", fontSize: 16 }}
          />
          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="New 4-digit PIN"
            value={newPin} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setNewPin(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #444", marginBottom: 10, textAlign: "center", fontSize: 16 }}
          />
          <input
            type="password" inputMode="numeric" maxLength={4} placeholder="Confirm new PIN"
            value={confirmPin} onChange={(e) => /^\d{0,4}$/.test(e.target.value) && setConfirmPin(e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #444", marginBottom: 14, textAlign: "center", fontSize: 16 }}
          />
          {error && <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 10 }}>{error}</p>}
          <button
            type="button"
            onClick={submitSetPin} disabled={busy || tempPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4}
            style={{ width: "100%", padding: 14, borderRadius: 12, background: "#c6972e", color: "#221a2e", fontWeight: 700, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "Saving…" : "Save PIN & Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Screen 2b: normal PIN pad --------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: "#221a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
        <button type="button" onClick={() => setSelected(null)} style={{ color: "#e9c979", fontSize: 12, marginBottom: 20 }}>← Change user</button>
        <p style={{ color: "#f7f2e7", fontWeight: 700, fontSize: 16 }}>{selected.display_name}</p>
        <p style={{ color: "#8a8296", fontSize: 12, textTransform: "capitalize" }}>{selected.role}</p>
        <p style={{ color: "#8a8296", fontSize: 12, marginTop: 14 }}>Enter PIN</p>
        <PinDots length={4} filled={pin.length} />
        {error && <p style={{ color: "#e38a8a", fontSize: 12 }}>{error}</p>}
        <PinPad onDigit={(d) => !busy && pin.length < 4 && void submitPin(pin + d)} onBackspace={() => setPin(pin.slice(0, -1))} />
        <p style={{ color: "#8a8296", fontSize: 11, marginTop: 20 }}>
          Forgot PIN? <span style={{ color: "#e9c979", fontWeight: 700 }}>Contact Admin</span>
        </p>
      </div>
    </div>
  );
}
