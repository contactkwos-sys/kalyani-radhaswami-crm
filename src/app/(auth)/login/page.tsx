"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listActiveUsers,
  loginWithPin,
  setInitialPin,
  getMyRole,
  ROLE_HOME,
  type ActiveUserTile,
} from "@/lib/auth/auth-lib";

/** High-contrast light auth palette — readable on phone/tablet. */
const C = {
  pageBg:
    "radial-gradient(900px 480px at 12% -8%, #cfe8e0 0%, transparent 55%), radial-gradient(700px 420px at 100% 0%, #f2e6cf 0%, transparent 48%), #eef3f0",
  panel: "#ffffff",
  ink: "#12201b",
  muted: "#3f524a",
  accent: "#0b6b5a",
  accentDark: "#084f43",
  brand: "#8b1e3d",
  border: "#9eb0a8",
  borderSoft: "#c5d2cc",
  padBg: "#ffffff",
  padBorder: "#7f958b",
  padText: "#12201b",
  dotOn: "#0b6b5a",
  dotOff: "#c5d2cc",
  danger: "#b42318",
  cta: "#0b6b5a",
  ctaText: "#ffffff",
  ctaDisabled: "#d5ded9",
  ctaDisabledText: "#6b7c74",
  tileBg: "#ffffff",
  tileHoverBorder: "#0b6b5a",
};

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "16px 0" }}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `2px solid ${i < filled ? C.dotOn : C.border}`,
            background: i < filled ? C.dotOn : "#fff",
            transition: "background 0.15s, border-color 0.15s",
          }}
        />
      ))}
    </div>
  );
}

function PinPad({
  onDigit,
  onBackspace,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        marginTop: 20,
      }}
    >
      {keys.map((k, i) =>
        k === "" ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onPointerUp={(e) => {
              e.preventDefault();
              if (disabled) return;
              if (k === "back") onBackspace();
              else onDigit(k);
            }}
            style={{
              height: 58,
              borderRadius: 14,
              border: `2px solid ${C.padBorder}`,
              background: C.padBg,
              color: C.padText,
              fontSize: 20,
              fontWeight: 700,
              opacity: disabled ? 0.5 : 1,
              touchAction: "manipulation",
              boxShadow: "0 1px 0 rgba(18,32,27,0.06)",
            }}
          >
            {k === "back" ? "⌫" : k}
          </button>
        )
      )}
    </div>
  );
}

function AuthShell({ children, maxWidth = 380 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.pageBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          background: C.panel,
          borderRadius: 20,
          border: `1px solid ${C.borderSoft}`,
          boxShadow: "0 12px 40px rgba(18,32,27,0.10)",
          padding: "28px 22px 24px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type SetPinStep = "temp" | "new" | "confirm";

export default function RoleLoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ActiveUserTile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<ActiveUserTile | null>(null);
  const [mode, setMode] = useState<"pin" | "setpin">("pin");
  const [pin, setPin] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [setPinStep, setSetPinStep] = useState<SetPinStep>("temp");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pinRef = useRef("");
  const tempPinRef = useRef("");
  const newPinRef = useRef("");
  const confirmPinRef = useRef("");
  const stepRef = useRef<SetPinStep>("temp");
  const lastDigitAt = useRef(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<ActiveUserTile | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    stepRef.current = setPinStep;
  }, [setPinStep]);

  useEffect(() => {
    listActiveUsers()
      .then((data) => setUsers(data))
      .catch((err) => {
        console.log(err);
        setError(`Could not load users: ${err.message || JSON.stringify(err)}`);
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  const clearAdvanceTimer = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };

  const resetSetPinState = () => {
    clearAdvanceTimer();
    tempPinRef.current = "";
    newPinRef.current = "";
    confirmPinRef.current = "";
    stepRef.current = "temp";
    setTempPin("");
    setNewPin("");
    setConfirmPin("");
    setSetPinStep("temp");
  };

  const pickUser = (u: ActiveUserTile) => {
    setSelected(u);
    selectedRef.current = u;
    setMode(u.pin_is_set ? "pin" : "setpin");
    pinRef.current = "";
    setPin("");
    resetSetPinState();
    setError("");
  };

  const goToRoleHome = async () => {
    try {
      const role = await getMyRole();
      router.replace(ROLE_HOME[role] || "/dashboard");
    } catch {
      router.replace("/dashboard");
    }
  };

  const submitPin = async (nextPin: string) => {
    pinRef.current = nextPin;
    setPin(nextPin);
    if (nextPin.length !== 4) return;
    const user = selectedRef.current;
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await loginWithPin(user.login_slug, nextPin);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Incorrect PIN.");
      pinRef.current = "";
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const submitSetPin = async () => {
    const user = selectedRef.current;
    if (!user) return;
    const nextTemp = tempPinRef.current;
    const nextNew = newPinRef.current;
    const nextConfirm = confirmPinRef.current;
    if (nextTemp.length !== 4 || nextNew.length !== 4 || nextConfirm.length !== 4) {
      setError("Enter all three 4-digit PINs.");
      return;
    }
    if (nextNew !== nextConfirm) {
      setError("New PIN and confirm PIN do not match. Try again.");
      clearAdvanceTimer();
      newPinRef.current = "";
      confirmPinRef.current = "";
      setNewPin("");
      setConfirmPin("");
      stepRef.current = "new";
      setSetPinStep("new");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setInitialPin(user.login_slug, nextTemp, nextNew, nextConfirm);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set PIN.");
      resetSetPinState();
    } finally {
      setBusy(false);
    }
  };

  const advanceSetPinStep = () => {
    if (busy) return;
    setError("");
    const step = stepRef.current;
    if (step === "temp") {
      if (tempPinRef.current.length !== 4) {
        setError("Enter the 4-digit temporary PIN.");
        return;
      }
      stepRef.current = "new";
      setSetPinStep("new");
      return;
    }
    if (step === "new") {
      if (newPinRef.current.length !== 4) {
        setError("Enter your new 4-digit PIN.");
        return;
      }
      stepRef.current = "confirm";
      setSetPinStep("confirm");
      return;
    }
    if (confirmPinRef.current.length !== 4) {
      setError("Confirm your 4-digit PIN.");
      return;
    }
    void submitSetPin();
  };

  const guardDigit = () => {
    const now = Date.now();
    if (now - lastDigitAt.current < 100) return false;
    lastDigitAt.current = now;
    return true;
  };

  const queueAdvance = () => {
    clearAdvanceTimer();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      advanceSetPinStep();
    }, 250);
  };

  const onSetPinDigit = (d: string) => {
    if (busy || !guardDigit()) return;
    setError("");
    const step = stepRef.current;
    if (step === "temp") {
      if (tempPinRef.current.length >= 4) return;
      const next = tempPinRef.current + d;
      tempPinRef.current = next;
      setTempPin(next);
      if (next.length === 4) queueAdvance();
      return;
    }
    if (step === "new") {
      if (newPinRef.current.length >= 4) return;
      const next = newPinRef.current + d;
      newPinRef.current = next;
      setNewPin(next);
      if (next.length === 4) queueAdvance();
      return;
    }
    if (confirmPinRef.current.length >= 4) return;
    const next = confirmPinRef.current + d;
    confirmPinRef.current = next;
    setConfirmPin(next);
    if (next.length === 4) queueAdvance();
  };

  const onSetPinBackspace = () => {
    if (busy) return;
    clearAdvanceTimer();
    const step = stepRef.current;
    if (step === "confirm") {
      const next = confirmPinRef.current.slice(0, -1);
      confirmPinRef.current = next;
      setConfirmPin(next);
      return;
    }
    if (step === "new") {
      const next = newPinRef.current.slice(0, -1);
      newPinRef.current = next;
      setNewPin(next);
      return;
    }
    const next = tempPinRef.current.slice(0, -1);
    tempPinRef.current = next;
    setTempPin(next);
  };

  if (!selected) {
    return (
      <AuthShell>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <p
            style={{
              color: C.accent,
              fontSize: 12,
              letterSpacing: "0.12em",
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            Sales Force CRM
          </p>
          <h1
            style={{
              color: C.ink,
              fontSize: 28,
              fontWeight: 800,
              margin: "8px 0 0",
              lineHeight: 1.15,
              fontFamily: "var(--font-display), Georgia, serif",
            }}
          >
            Kalyani · Radhaswami
          </h1>
          <p style={{ color: C.muted, fontSize: 15, marginTop: 10, fontWeight: 600 }}>
            Select your name to sign in
          </p>
        </div>
        {loadingUsers && (
          <p style={{ color: C.muted, textAlign: "center", fontSize: 15 }}>Loading…</p>
        )}
        {error && (
          <p
            style={{
              color: C.danger,
              textAlign: "center",
              marginBottom: 12,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {error}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => pickUser(u)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 16,
                background: C.tileBg,
                border: `2px solid ${C.border}`,
                textAlign: "left",
                color: C.ink,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: C.brand,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                }}
              >
                {u.display_name
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <p style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>{u.display_name}</p>
                <p
                  style={{
                    fontSize: 13,
                    color: C.accentDark,
                    textTransform: "capitalize",
                    fontWeight: 700,
                    margin: "2px 0 0",
                  }}
                >
                  {u.role}
                </p>
              </div>
            </button>
          ))}
        </div>
        <p
          style={{
            textAlign: "center",
            color: C.muted,
            fontSize: 13,
            marginTop: 18,
            fontWeight: 600,
          }}
        >
          No OTP · PIN login only
        </p>
      </AuthShell>
    );
  }

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
    const canAdvance = filled === 4 && !busy;
    const actionLabel =
      setPinStep === "confirm"
        ? busy
          ? "Saving…"
          : "Save PIN & Open Dashboard"
        : "Next";

    return (
      <AuthShell maxWidth={340}>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{
            color: C.accentDark,
            fontSize: 14,
            marginBottom: 16,
            fontWeight: 700,
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          ← Change user
        </button>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: C.ink, fontWeight: 800, fontSize: 18, margin: 0 }}>
            {selected.display_name}
          </p>
          <p style={{ color: C.muted, fontSize: 14, marginBottom: 8, fontWeight: 600 }}>
            First-time login — set your PIN
          </p>
          <p style={{ color: C.accentDark, fontSize: 14, marginBottom: 4, fontWeight: 800 }}>
            {stepLabel}
          </p>
          <PinDots length={4} filled={filled} />
          {error && (
            <p style={{ color: C.danger, fontSize: 14, marginBottom: 10, fontWeight: 700 }}>
              {error}
            </p>
          )}
          <PinPad
            onDigit={onSetPinDigit}
            onBackspace={onSetPinBackspace}
            disabled={busy}
          />
          <button
            type="button"
            disabled={!canAdvance}
            onPointerUp={(e) => {
              e.preventDefault();
              if (!canAdvance) return;
              clearAdvanceTimer();
              advanceSetPinStep();
            }}
            style={{
              width: "100%",
              marginTop: 16,
              padding: 15,
              borderRadius: 12,
              background: canAdvance ? C.cta : C.ctaDisabled,
              color: canAdvance ? C.ctaText : C.ctaDisabledText,
              fontWeight: 800,
              fontSize: 15,
              border: "none",
              touchAction: "manipulation",
            }}
          >
            {actionLabel}
          </button>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 16, fontWeight: 600 }}>
            Tip: you may keep the same PIN (e.g. 1234) for all three steps.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth={340}>
      <button
        type="button"
        onClick={() => setSelected(null)}
        style={{
          color: C.accentDark,
          fontSize: 14,
          marginBottom: 16,
          fontWeight: 700,
          background: "none",
          border: "none",
          padding: 0,
        }}
      >
        ← Change user
      </button>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: C.ink, fontWeight: 800, fontSize: 18, margin: 0 }}>
          {selected.display_name}
        </p>
        <p
          style={{
            color: C.accentDark,
            fontSize: 14,
            textTransform: "capitalize",
            fontWeight: 700,
          }}
        >
          {selected.role}
        </p>
        <p style={{ color: C.muted, fontSize: 15, marginTop: 14, fontWeight: 700 }}>
          Enter PIN
        </p>
        <PinDots length={4} filled={pin.length} />
        {error && (
          <p style={{ color: C.danger, fontSize: 14, fontWeight: 700 }}>{error}</p>
        )}
        <PinPad
          disabled={busy}
          onDigit={(d) => {
            if (busy || pinRef.current.length >= 4 || !guardDigit()) return;
            void submitPin(pinRef.current + d);
          }}
          onBackspace={() => {
            const next = pinRef.current.slice(0, -1);
            pinRef.current = next;
            setPin(next);
          }}
        />
        <p style={{ color: C.muted, fontSize: 13, marginTop: 20, fontWeight: 600 }}>
          Forgot PIN?{" "}
          <span style={{ color: C.brand, fontWeight: 800 }}>Contact Admin</span>
        </p>
      </div>
    </AuthShell>
  );
}
