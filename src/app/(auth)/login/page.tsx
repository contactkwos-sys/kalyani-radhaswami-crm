"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  listActiveUsers,
  loginWithPin,
  completeFirstLogin,
  ROLE_HOME,
  roleSubtitleForLoginRole,
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

function tileTitle(u: ActiveUserTile): string {
  if (u.role === "ceo") {
    // Never show personal CEO names on the public login screen.
    if (
      u.display_name.toLowerCase().includes("kailash") ||
      u.display_name.startsWith("CEO (")
    ) {
      return "CEO";
    }
  }
  return u.display_name;
}

function tileSubtitle(u: ActiveUserTile): string {
  if (u.role === "ceo") return "Chief Executive / Management";
  return u.role_subtitle || roleSubtitleForLoginRole(u.role);
}

function RememberToggle({
  remember,
  onChange,
}: {
  remember: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "center",
        marginTop: 14,
        color: C.muted,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <input
        type="checkbox"
        checked={remember}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: C.accent }}
      />
      Remember this device
    </label>
  );
}

export default function RoleLoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ActiveUserTile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selected, setSelected] = useState<ActiveUserTile | null>(null);
  const [mode, setMode] = useState<"pin" | "setpin">("pin");
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMobile, setShowMobile] = useState(false);
  const [mobile, setMobile] = useState("");
  const [mobilePin, setMobilePin] = useState("");

  const pinRef = useRef("");
  const lastDigitAt = useRef(0);
  const selectedRef = useRef<ActiveUserTile | null>(null);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rememberRef = useRef(true);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    rememberRef.current = remember;
  }, [remember]);

  useEffect(() => {
    // Attempt silent restore from trusted device cookie (never stores PIN).
    void fetch("/api/auth/device-restore?format=json", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data.ok) router.replace(data.home || "/dashboard");
      })
      .catch(() => {
        /* stay on login */
      });

    listActiveUsers()
      .then((data) => setUsers(data))
      .catch((err) => {
        setError(`Could not load users: ${err.message || JSON.stringify(err)}`);
      })
      .finally(() => setLoadingUsers(false));
  }, [router]);

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

  const goHome = (home?: string) => {
    router.replace(home || "/dashboard");
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
      const data = await loginWithPin(user.login_slug, nextPin, rememberRef.current);
      goHome(data.home || ROLE_HOME[user.role] || "/dashboard");
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
      const data = await completeFirstLogin(
        user.login_slug,
        nextPin,
        rememberRef.current
      );
      goHome(data.home || ROLE_HOME[user.role] || "/dashboard");
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

  const submitMobileLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/mobile-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile,
          pin: mobilePin,
          remember,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Invalid mobile number or PIN.");
      if (data.mustChangePin) {
        router.replace("/settings/account?forced=1");
      } else {
        goHome(data.home || "/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (showMobile) {
    return (
      <AuthShell maxWidth={360}>
        <button
          type="button"
          onClick={() => {
            setShowMobile(false);
            setError("");
          }}
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
          ← Back to users
        </button>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h1
            style={{
              color: C.ink,
              fontSize: 24,
              fontWeight: 800,
              margin: 0,
              fontFamily: "var(--font-display), Georgia, serif",
            }}
          >
            Kalyani · Radhaswami
          </h1>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 8, fontWeight: 600 }}>
            Sign in with mobile number + PIN
          </p>
        </div>
        <form onSubmit={submitMobileLogin}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink }}>
            Mobile Number
            <input
              type="tel"
              inputMode="numeric"
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="10-digit mobile number"
              style={{
                width: "100%",
                marginTop: 6,
                marginBottom: 12,
                padding: "12px 14px",
                borderRadius: 12,
                border: `2px solid ${C.border}`,
                fontSize: 16,
              }}
            />
          </label>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.ink }}>
            PIN
            <input
              type="password"
              inputMode="numeric"
              required
              maxLength={8}
              value={mobilePin}
              onChange={(e) =>
                setMobilePin(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="• • • •"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "12px 14px",
                borderRadius: 12,
                border: `2px solid ${C.border}`,
                fontSize: 16,
                letterSpacing: "0.3em",
              }}
            />
          </label>
          <RememberToggle remember={remember} onChange={setRemember} />
          {error && (
            <p style={{ color: C.danger, fontSize: 14, fontWeight: 700, marginTop: 10 }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || mobilePin.length < 4}
            style={{
              width: "100%",
              marginTop: 16,
              padding: 15,
              borderRadius: 12,
              background: busy ? C.ctaDisabled : C.cta,
              color: busy ? C.ctaDisabledText : C.ctaText,
              fontWeight: 800,
              fontSize: 15,
              border: "none",
            }}
          >
            {busy ? "Signing in…" : "Login"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 14, fontSize: 13, fontWeight: 600 }}>
          <Link href="/forgot-pin" style={{ color: C.brand, fontWeight: 800 }}>
            Forgot PIN
          </Link>
        </p>
      </AuthShell>
    );
  }

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
          {users.map((u) => {
            const title = tileTitle(u);
            const subtitle = tileSubtitle(u);
            return (
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
                  {title
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 16, margin: 0 }}>{title}</p>
                  <p
                    style={{
                      fontSize: 13,
                      color: C.accentDark,
                      fontWeight: 700,
                      margin: "2px 0 0",
                    }}
                  >
                    {subtitle}
                  </p>
                </div>
              </button>
            );
          })}
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
        <button
          type="button"
          onClick={() => {
            setShowMobile(true);
            setError("");
          }}
          style={{
            display: "block",
            width: "100%",
            marginTop: 10,
            background: "none",
            border: "none",
            color: C.accentDark,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Sign in with mobile number
        </button>
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
            {tileTitle(selected)}
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
          <RememberToggle remember={remember} onChange={setRemember} />
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
          {tileTitle(selected)}
        </p>
        <p
          style={{
            color: C.accentDark,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {tileSubtitle(selected)}
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
        <RememberToggle remember={remember} onChange={setRemember} />
        <p style={{ color: C.muted, fontSize: 13, marginTop: 20, fontWeight: 600 }}>
          Forgot PIN?{" "}
          <Link href="/forgot-pin" style={{ color: C.brand, fontWeight: 800 }}>
            Contact Admin
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
