"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listActiveUsers,
  loginWithPin,
  completeFirstLogin,
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
  danger: "#b42318",
  cta: "#0b6b5a",
  ctaText: "#ffffff",
  ctaDisabled: "#d5ded9",
  ctaDisabledText: "#6b7c74",
  tileBg: "#ffffff",
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

export default function RoleLoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ActiveUserTile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<ActiveUserTile | null>(null);
  const [mode, setMode] = useState<"pin" | "setpin">("pin");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pinRef = useRef("");
  const lastDigitAt = useRef(0);
  const selectedRef = useRef<ActiveUserTile | null>(null);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    listActiveUsers()
      .then((data) => setUsers(data))
      .catch((err) => {
        console.log(err);
        setError(`Could not load users: ${err.message || JSON.stringify(err)}`);
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    return () => {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    };
  }, []);

  const clearSubmitTimer = () => {
    if (submitTimer.current) {
      clearTimeout(submitTimer.current);
      submitTimer.current = null;
    }
  };

  const pickUser = (u: ActiveUserTile) => {
    clearSubmitTimer();
    setSelected(u);
    selectedRef.current = u;
    setMode(u.pin_is_set ? "pin" : "setpin");
    pinRef.current = "";
    setPin("");
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

  const guardDigit = () => {
    const now = Date.now();
    if (now - lastDigitAt.current < 100) return false;
    lastDigitAt.current = now;
    return true;
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

  /** First-time: one PIN entry — the admin temporary PIN becomes the login PIN. */
  const submitFirstPin = async (nextPin: string) => {
    pinRef.current = nextPin;
    setPin(nextPin);
    if (nextPin.length !== 4) return;
    const user = selectedRef.current;
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await completeFirstLogin(user.login_slug, nextPin);
      await goToRoleHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      pinRef.current = "";
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  const queueFirstPinSubmit = (nextPin: string) => {
    clearSubmitTimer();
    submitTimer.current = setTimeout(() => {
      submitTimer.current = null;
      void submitFirstPin(nextPin);
    }, 250);
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
    const canSave = pin.length === 4 && !busy;

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
            First-time login
          </p>
          <p style={{ color: C.accentDark, fontSize: 14, marginBottom: 4, fontWeight: 800 }}>
            Enter the PIN from admin once
          </p>
          <PinDots length={4} filled={pin.length} />
          {error && (
            <p style={{ color: C.danger, fontSize: 14, marginBottom: 10, fontWeight: 700 }}>
              {error}
            </p>
          )}
          <PinPad
            disabled={busy}
            onDigit={(d) => {
              if (busy || pinRef.current.length >= 4 || !guardDigit()) return;
              setError("");
              const next = pinRef.current + d;
              pinRef.current = next;
              setPin(next);
              if (next.length === 4) queueFirstPinSubmit(next);
            }}
            onBackspace={() => {
              if (busy) return;
              clearSubmitTimer();
              const next = pinRef.current.slice(0, -1);
              pinRef.current = next;
              setPin(next);
            }}
          />
          <button
            type="button"
            disabled={!canSave}
            onPointerUp={(e) => {
              e.preventDefault();
              if (!canSave) return;
              clearSubmitTimer();
              void submitFirstPin(pinRef.current);
            }}
            style={{
              width: "100%",
              marginTop: 16,
              padding: 15,
              borderRadius: 12,
              background: canSave ? C.cta : C.ctaDisabled,
              color: canSave ? C.ctaText : C.ctaDisabledText,
              fontWeight: 800,
              fontSize: 15,
              border: "none",
              touchAction: "manipulation",
            }}
          >
            {busy ? "Opening…" : "Open Dashboard"}
          </button>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 16, fontWeight: 600 }}>
            This PIN becomes your login PIN. No second or third entry.
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
