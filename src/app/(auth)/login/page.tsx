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

type SetPinStep = "temp" | "new" | "confirm";

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
  const [setPinStep, setSetPinStep] = useState<SetPinStep>("temp");
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
    setPin("");
    setTempPin("");
    setNewPin("");
    setConfirmPin("");
    setSetPinStep("temp");
    setError("");
  };

  const goToRoleHome = async () => {
    try {
      const role = await getMyRole();
      router.replace(ROLE_HOME[role] || "/dashboard");
    } catch {
      // Role RPC hiccup must not strand the user after a successful PIN login.
      router.replace("/dashboard");
    }
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

  const submitSetPin = async (
    nextTemp: string,
    nextNew: string,
    nextConfirm: string
  ) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await setInitialPin(selected.login_slug, nextTemp, nextNew, nextConfirm);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set PIN.");
      setTempPin("");
      setNewPin("");
      setConfirmPin("");
      setSetPinStep("temp");
    } finally {
      setBusy(false);
    }
  };

  const onSetPinDigit = (d: string) => {
    if (busy) return;
    setError("");
    if (setPinStep === "temp") {
      const next = (tempPin + d).slice(0, 4);
      setTempPin(next);
      if (next.length === 4) setSetPinStep("new");
      return;
    }
    if (setPinStep === "new") {
      const next = (newPin + d).slice(0, 4);
      setNewPin(next);
      if (next.length === 4) setSetPinStep("confirm");
      return;
    }
    const next = (confirmPin + d).slice(0, 4);
    setConfirmPin(next);
    if (next.length === 4) void submitSetPin(tempPin, newPin, next);
  };

  const onSetPinBackspace = () => {
    if (busy) return;
    if (setPinStep === "confirm") {
      if (confirmPin.length > 0) {
        setConfirmPin(confirmPin.slice(0, -1));
        return;
      }
      setSetPinStep("new");
      return;
    }
    if (setPinStep === "new") {
      if (newPin.length > 0) {
        setNewPin(newPin.slice(0, -1));
        return;
      }
      setSetPinStep("temp");
      return;
    }
    setTempPin(tempPin.slice(0, -1));
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

  // ---- Screen 2a: first-time "Set your PIN" (on-screen pad — works on iPad) ----
  if (mode === "setpin") {
    const stepLabel =
      setPinStep === "temp"
        ? "1/3 · Enter temporary PIN from admin"
        : setPinStep === "new"
          ? "2/3 · Choose your new 4-digit PIN"
          : "3/3 · Confirm your new PIN";
    const filled =
      setPinStep === "temp"
        ? tempPin.length
        : setPinStep === "new"
          ? newPin.length
          : confirmPin.length;

    return (
      <div style={{ minHeight: "100vh", background: "#221a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{ color: "#e9c979", fontSize: 12, marginBottom: 20 }}
          >
            ← Change user
          </button>
          <p style={{ color: "#f7f2e7", fontWeight: 700, fontSize: 16 }}>{selected.display_name}</p>
          <p style={{ color: "#8a8296", fontSize: 12, marginBottom: 8 }}>First-time login — set your PIN</p>
          <p style={{ color: "#c6972e", fontSize: 12, marginBottom: 4 }}>{stepLabel}</p>
          <PinDots length={4} filled={filled} />
          {busy && <p style={{ color: "#8a8296", fontSize: 12 }}>Saving… opening dashboard</p>}
          {error && <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 10 }}>{error}</p>}
          <PinPad onDigit={onSetPinDigit} onBackspace={onSetPinBackspace} />
          <p style={{ color: "#8a8296", fontSize: 10.5, marginTop: 16 }}>
            Tip: you may keep the same PIN (e.g. 1234) for all three steps.
          </p>
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
