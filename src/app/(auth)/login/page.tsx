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

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "16px 0" }}>
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
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
              height: 56,
              borderRadius: 14,
              border: "1px solid #e4dac4",
              background: "#fff",
              fontSize: 18,
              fontWeight: 700,
              opacity: disabled ? 0.5 : 1,
              touchAction: "manipulation",
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
      <div
        style={{
          minHeight: "100vh",
          background: "#221a2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <p
              style={{
                color: "#e9c979",
                fontSize: 11,
                letterSpacing: 1,
                fontWeight: 700,
              }}
            >
              SALES FORCE CRM
            </p>
            <h1
              style={{
                color: "#f7f2e7",
                fontSize: 24,
                fontWeight: 700,
                margin: "4px 0",
              }}
            >
              Kalyani · Radhaswami
            </h1>
            <p style={{ color: "#8a8296", fontSize: 12, marginTop: 10 }}>
              Select your name to sign in
            </p>
          </div>
          {loadingUsers && (
            <p style={{ color: "#8a8296", textAlign: "center" }}>Loading…</p>
          )}
          {error && (
            <p
              style={{
                color: "#e38a8a",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {error}
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 16,
                  background: "rgba(247,242,231,0.05)",
                  border: "1px solid rgba(247,242,231,0.12)",
                  textAlign: "left",
                  color: "#f7f2e7",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#7c2142",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
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
                  <p style={{ fontWeight: 700, fontSize: 14 }}>{u.display_name}</p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "#c6972e",
                      textTransform: "capitalize",
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
              color: "#8a8296",
              fontSize: 10.5,
              marginTop: 20,
            }}
          >
            No OTP · PIN login only
          </p>
        </div>
      </div>
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
      <div
        style={{
          minHeight: "100vh",
          background: "#221a2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => setSelected(null)}
            style={{ color: "#e9c979", fontSize: 12, marginBottom: 20 }}
          >
            ← Change user
          </button>
          <p style={{ color: "#f7f2e7", fontWeight: 700, fontSize: 16 }}>
            {selected.display_name}
          </p>
          <p style={{ color: "#8a8296", fontSize: 12, marginBottom: 8 }}>
            First-time login — set your PIN
          </p>
          <p style={{ color: "#c6972e", fontSize: 12, marginBottom: 4 }}>
            {stepLabel}
          </p>
          <PinDots length={4} filled={filled} />
          {error && (
            <p style={{ color: "#e38a8a", fontSize: 12, marginBottom: 10 }}>
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
              padding: 14,
              borderRadius: 12,
              background: canAdvance ? "#c6972e" : "#444",
              color: canAdvance ? "#221a2e" : "#888",
              fontWeight: 700,
              border: "none",
              touchAction: "manipulation",
            }}
          >
            {actionLabel}
          </button>
          <p style={{ color: "#8a8296", fontSize: 10.5, marginTop: 16 }}>
            Tip: you may keep the same PIN (e.g. 1234) for all three steps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#221a2e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
        <button
          type="button"
          onClick={() => setSelected(null)}
          style={{ color: "#e9c979", fontSize: 12, marginBottom: 20 }}
        >
          ← Change user
        </button>
        <p style={{ color: "#f7f2e7", fontWeight: 700, fontSize: 16 }}>
          {selected.display_name}
        </p>
        <p
          style={{
            color: "#8a8296",
            fontSize: 12,
            textTransform: "capitalize",
          }}
        >
          {selected.role}
        </p>
        <p style={{ color: "#8a8296", fontSize: 12, marginTop: 14 }}>
          Enter PIN
        </p>
        <PinDots length={4} filled={pin.length} />
        {error && <p style={{ color: "#e38a8a", fontSize: 12 }}>{error}</p>}
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
        <p style={{ color: "#8a8296", fontSize: 11, marginTop: 20 }}>
          Forgot PIN?{" "}
          <span style={{ color: "#e9c979", fontWeight: 700 }}>Contact Admin</span>
        </p>
      </div>
    </div>
  );
}
