"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ROLE_HOME,
  getMyRole,
  listActiveUsers,
  loginWithPin,
  completeFirstLogin,
  type ActiveUserTile,
} from "@/lib/auth/auth-lib";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];

export function RoleLoginForm() {
  const router = useRouter();
  const [tiles, setTiles] = useState<ActiveUserTile[]>([]);
  const [slug, setSlug] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"login" | "set">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTiles, setLoadingTiles] = useState(true);

  useEffect(() => {
    listActiveUsers()
      .then((rows) => setTiles(rows))
      .catch(() => setTiles([]))
      .finally(() => setLoadingTiles(false));
  }, []);

  const selected = useMemo(
    () => tiles.find((t) => t.login_slug === slug) || null,
    [tiles, slug]
  );

  function pushDigit(d: string) {
    setError(null);
    if (pin.length >= 4) return;
    setPin(pin + d);
  }

  function backspace() {
    setError(null);
    setPin(pin.slice(0, -1));
  }

  async function goHome() {
    const role = await getMyRole();
    router.replace(ROLE_HOME[role] || "/dashboard");
    router.refresh();
  }

  async function submit() {
    if (!slug) {
      setError("Select a role tile first.");
      return;
    }
    if (pin.length !== 4) {
      setError(
        mode === "set"
          ? "Enter the 4-digit PIN from admin."
          : "Enter your 4-digit PIN."
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "set") {
        await completeFirstLogin(slug, pin);
      } else {
        await loginWithPin(slug, pin);
      }
      await goHome();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
      setPin("");
      setLoading(false);
    }
  }

  function onKey(k: string) {
    if (k === "⌫") return backspace();
    if (k === "OK") return void submit();
    pushDigit(k);
  }

  function selectTile(t: ActiveUserTile) {
    setSlug(t.login_slug);
    setPin("");
    setError(null);
    setMode(t.pin_is_set ? "login" : "set");
  }

  const prompt =
    mode === "set" ? "Enter the PIN from admin once" : "Enter PIN";

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
              const active = t.login_slug === slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTile(t)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                      : "border-[var(--border)] bg-white hover:border-[var(--accent)]/50"
                  }`}
                >
                  <span className="block text-base font-semibold text-[var(--ink)]">
                    {t.display_name}
                  </span>
                  {!t.pin_is_set ? (
                    <span className="mt-1 block text-xs text-amber-700">
                      First-time: enter PIN once
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
            <p className="mb-1 text-sm font-medium text-[var(--ink)]">{prompt}</p>
            <div className="flex justify-center gap-3 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full ${
                    i < pin.length
                      ? "bg-[var(--accent)]"
                      : "bg-[var(--border)]"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={loading}
                onClick={() => onKey(k)}
                className={`rounded-xl border border-[var(--border)] bg-white py-3 text-lg font-semibold text-[var(--ink)] transition hover:bg-[var(--surface-2)] disabled:opacity-50 ${
                  k === "OK"
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
                    : ""
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
