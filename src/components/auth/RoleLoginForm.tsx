"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Tile = {
  tile_key: string;
  tile_label: string;
  must_set_pin: boolean;
  sort_order: number;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];

export function RoleLoginForm() {
  const router = useRouter();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [tileKey, setTileKey] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [mode, setMode] = useState<"login" | "set">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTiles, setLoadingTiles] = useState(true);

  useEffect(() => {
    fetch("/api/auth/login-tiles")
      .then((r) => r.json())
      .then((d) => setTiles(Array.isArray(d.tiles) ? d.tiles : []))
      .catch(() => setTiles([]))
      .finally(() => setLoadingTiles(false));
  }, []);

  const selected = useMemo(
    () => tiles.find((t) => t.tile_key === tileKey) || null,
    [tiles, tileKey]
  );

  function pushDigit(d: string) {
    setError(null);
    if (mode === "set" && pin.length >= 4 && confirmPin.length < 8) {
      setConfirmPin((p) => (p + d).slice(0, 8));
      return;
    }
    setPin((p) => (p.length >= 8 ? p : p + d));
  }

  function backspace() {
    setError(null);
    if (mode === "set" && confirmPin.length > 0) {
      setConfirmPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    if (!tileKey) {
      setError("Select a role tile first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "set") {
        const res = await fetch("/api/auth/set-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tileKey, pin, confirmPin }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Unable to set PIN.");
          setLoading(false);
          return;
        }
        router.replace(data.home || "/dashboard");
        router.refresh();
        return;
      }

      const res = await fetch("/api/auth/role-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tileKey, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.mustSetPin) {
          setMode("set");
          setPin("");
          setConfirmPin("");
          setError("First login — set your PIN (4–8 digits).");
          setLoading(false);
          return;
        }
        setError(data.error || "Invalid role or PIN.");
        setLoading(false);
        return;
      }
      router.replace(data.home || "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
      setLoading(false);
    }
  }

  function onKey(k: string) {
    if (k === "⌫") return backspace();
    if (k === "OK") return void submit();
    pushDigit(k);
  }

  function selectTile(t: Tile) {
    setTileKey(t.tile_key);
    setPin("");
    setConfirmPin("");
    setError(null);
    setMode(t.must_set_pin ? "set" : "login");
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <p className="mb-2 text-sm font-medium text-[var(--ink)]">Select role</p>
        {loadingTiles ? (
          <p className="text-sm text-[var(--muted)]">Loading roles…</p>
        ) : tiles.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No login roles seeded yet. Create auth users, then insert{" "}
            <code className="font-mono text-xs">app_users</code> rows.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tiles.map((t) => {
              const active = t.tile_key === tileKey;
              return (
                <button
                  key={t.tile_key}
                  type="button"
                  onClick={() => selectTile(t)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                      : "border-[var(--border)] bg-white hover:border-[var(--accent)]/50"
                  }`}
                >
                  <span className="block text-base font-semibold text-[var(--ink)]">
                    {t.tile_label}
                  </span>
                  {t.must_set_pin ? (
                    <span className="mt-1 block text-xs text-amber-700">
                      First-time: set PIN
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      PIN login
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div>
            <p className="mb-1 text-sm font-medium text-[var(--ink)]">
              {mode === "set"
                ? confirmPin.length > 0 || pin.length >= 4
                  ? pin.length < 4
                    ? "Enter new PIN"
                    : "Confirm PIN"
                  : "Set your PIN"
                : "Enter PIN"}
            </p>
            <div className="flex justify-center gap-2 py-2 tracking-[0.35em]">
              {Array.from({ length: 8 }).map((_, i) => {
                const filled =
                  mode === "set" && pin.length >= 4
                    ? i < confirmPin.length
                    : i < pin.length;
                return (
                  <span
                    key={i}
                    className={`h-3 w-3 rounded-full ${
                      filled ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                    }`}
                  />
                );
              })}
            </div>
            {mode === "set" && (
              <p className="text-center text-xs text-[var(--muted)]">
                Choose a 4–8 digit PIN, then confirm it.
              </p>
            )}
          </div>

          <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={loading}
                onClick={() => onKey(k)}
                className={`rounded-xl border border-[var(--border)] bg-white py-3 text-lg font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)] disabled:opacity-50 ${
                  k === "OK" ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]" : ""
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
