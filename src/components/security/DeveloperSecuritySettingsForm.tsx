"use client";

import { useEffect, useState } from "react";

export function DeveloperSecuritySettingsForm({
  isDeveloper,
}: {
  isDeveloper: boolean;
}) {
  const [lockoutAttempts, setLockoutAttempts] = useState(5);
  const [lockoutMinutes, setLockoutMinutes] = useState(15);
  const [rolePermissionsJson, setRolePermissionsJson] = useState("{}");
  const [overrideKey, setOverrideKey] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/admin/security-settings")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(Boolean(d.overrideConfigured));
        if (d.lockoutPolicy) {
          setLockoutAttempts(d.lockoutPolicy.max_failed_attempts ?? 5);
          setLockoutMinutes(d.lockoutPolicy.lockout_minutes ?? 15);
        }
        if (d.rolePermissions) {
          setRolePermissionsJson(JSON.stringify(d.rolePermissions, null, 2));
        }
      })
      .catch(() => setConfigured(false));
  }, []);

  if (!isDeveloper) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Application security settings require the Owner/Developer account.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      let rolePermissions: unknown = {};
      try {
        rolePermissions = JSON.parse(rolePermissionsJson || "{}");
      } catch {
        throw new Error("Role permissions must be valid JSON.");
      }
      if (!window.confirm("Update application security settings?")) {
        setPending(false);
        return;
      }
      const res = await fetch("/api/admin/security-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          developerOverrideKey: overrideKey,
          lockoutPolicy: {
            max_failed_attempts: lockoutAttempts,
            lockout_minutes: lockoutMinutes,
          },
          rolePermissions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setMessage("Security settings updated.");
      setOverrideKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      <h3 className="text-lg font-semibold">Developer security settings</h3>
      <p className="text-sm text-[var(--muted)]">
        Changes require Developer Override confirmation. The override key exists
        only in server environment variables
        {configured === false
          ? " — not configured yet on this server."
          : configured
            ? " — configured on this server."
            : "."}
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Max failed PIN attempts
        </label>
        <input
          type="number"
          min={3}
          max={20}
          value={lockoutAttempts}
          onChange={(e) => setLockoutAttempts(Number(e.target.value))}
          className="w-full rounded-md border border-[var(--border)] px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Lockout minutes
        </label>
        <input
          type="number"
          min={1}
          max={1440}
          value={lockoutMinutes}
          onChange={(e) => setLockoutMinutes(Number(e.target.value))}
          className="w-full rounded-md border border-[var(--border)] px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Role permission overrides (JSON)
        </label>
        <textarea
          rows={8}
          value={rolePermissionsJson}
          onChange={(e) => setRolePermissionsJson(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] px-3 py-2 font-mono text-xs"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Developer Override confirmation
        </label>
        <input
          type="password"
          autoComplete="off"
          required
          value={overrideKey}
          onChange={(e) => setOverrideKey(e.target.value)}
          className="w-full rounded-md border border-amber-300 px-3 py-2"
        />
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--accent)] px-4 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save security settings"}
      </button>
    </form>
  );
}
