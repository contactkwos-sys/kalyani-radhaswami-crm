"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Device = {
  id: string;
  device_label: string | null;
  user_agent: string | null;
  ip_address: string | null;
  last_seen_at: string;
  created_at: string;
  revoked_at: string | null;
};

type UserInfo = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  mobile_number: string | null;
  last_login_at: string | null;
  pin_updated_at: string | null;
  locked_until: string | null;
  has_pin: boolean;
  is_primary_owner?: boolean;
  is_developer?: boolean;
};

type SecurityMeta = {
  overrideConfigured: boolean;
  actorIsDeveloper: boolean;
  isPrimaryOwner: boolean;
};

const ROLES = [
  "CEO_1",
  "CEO_2",
  "CEO_3",
  "ADMIN",
  "SALES_MANAGER",
  "SALESMAN",
  "ACCOUNTANT",
  "VIEWER",
  "OWNER",
] as const;

export function UserSecurityPanel({
  user,
  devices: initialDevices,
  security,
}: {
  user: UserInfo;
  devices: Device[];
  security: SecurityMeta;
}) {
  const router = useRouter();
  const [mobile, setMobile] = useState(user.mobile_number || "");
  const [newPin, setNewPin] = useState("");
  const [role, setRole] = useState(user.role);
  const [devices, setDevices] = useState(initialDevices);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [overrideKey, setOverrideKey] = useState("");
  const [confirmText, setConfirmText] = useState("");

  async function run(
    action: string,
    body: Record<string, unknown> = {},
    opts?: { requireOverride?: boolean; requireConfirmWord?: string }
  ) {
    setPending(true);
    setError(null);
    setMessage(null);
    setGeneratedPin(null);
    try {
      if (opts?.requireConfirmWord && confirmText !== opts.requireConfirmWord) {
        throw new Error(`Type ${opts.requireConfirmWord} to confirm.`);
      }
      const payload: Record<string, unknown> = {
        action,
        confirm: true,
        ...body,
      };
      if (opts?.requireOverride || security.actorIsDeveloper) {
        if (overrideKey) payload.developerOverrideKey = overrideKey;
      }
      if (opts?.requireOverride && !overrideKey) {
        throw new Error("Enter Developer Override confirmation.");
      }

      const res = await fetch(`/api/admin/users/${user.id}/security`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessage(data.message || "Saved.");
      if (data.temporaryPin) {
        setGeneratedPin(String(data.temporaryPin));
      }
      setNewPin("");
      setOverrideKey("");
      setConfirmText("");
      router.refresh();
      const refresh = await fetch(`/api/admin/users/${user.id}/security`);
      if (refresh.ok) {
        const j = await refresh.json();
        setDevices(j.devices || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const [now] = useState(() => Date.now());
  const locked =
    Boolean(user.locked_until) &&
    new Date(user.locked_until as string).getTime() > now;
  const privileged = ["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"].includes(
    user.role
  );

  return (
    <div className="space-y-6">
      {(message || error) && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-2 text-sm">
        <h3 className="font-semibold">User</h3>
        <p>
          {user.full_name} · {user.role} · {user.email}
        </p>
        <p>
          Status:{" "}
          <span className={user.is_active ? "text-emerald-700" : "text-red-700"}>
            {user.is_active ? "Active" : "Disabled"}
          </span>
          {user.is_primary_owner ? " · Primary Owner (protected)" : ""}
          {user.is_developer ? " · Developer" : ""}
        </p>
        <p>
          Last login:{" "}
          {user.last_login_at
            ? new Date(user.last_login_at).toLocaleString()
            : "—"}
        </p>
        <p>PIN set: {user.has_pin ? "Yes" : "No"}</p>
        <p>
          PIN updated:{" "}
          {user.pin_updated_at
            ? new Date(user.pin_updated_at).toLocaleString()
            : "—"}
        </p>
        <p>
          Lock:{" "}
          {locked
            ? `Locked until ${new Date(user.locked_until as string).toLocaleString()}`
            : "Not locked"}
        </p>
      </section>

      {security.actorIsDeveloper && security.overrideConfigured && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <h3 className="font-semibold text-amber-950">
            Developer Override confirmation
          </h3>
          <p className="text-sm text-amber-900">
            Required for destructive actions (delete, change role, privileged
            PIN reset, revoke-all on Admin/Owner). The key is verified only on
            the server and is never stored in the browser.
          </p>
          <input
            type="password"
            autoComplete="off"
            value={overrideKey}
            onChange={(e) => setOverrideKey(e.target.value)}
            placeholder="Enter override confirmation"
            className="w-full max-w-md rounded-md border border-amber-300 bg-white px-3 py-2 text-sm"
          />
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h3 className="font-semibold">Mobile number</h3>
        <input
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          className="w-full max-w-sm rounded-md border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => run("set_mobile", { mobile })}
          className="rounded-md border px-3 py-2 text-sm font-semibold"
        >
          Save mobile
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h3 className="font-semibold">Reset PIN</h3>
        <p className="text-sm text-[var(--muted)]">
          Enter a temporary PIN, or auto-generate one. Existing PIN is never
          shown. Remembered devices and sessions are revoked; the user must log
          in again.
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="New 4–8 digit PIN"
          value={newPin}
          onChange={(e) =>
            setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))
          }
          className="w-full max-w-sm rounded-md border border-[var(--border)] px-3 py-2 text-sm tracking-[0.25em]"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || newPin.length < 4}
            onClick={() =>
              run(
                privileged ? "force_pin_reset" : "reset_pin",
                { newPin, mobile },
                { requireOverride: privileged && security.actorIsDeveloper }
              )
            }
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Reset PIN
          </button>
          <button
            type="button"
            disabled={pending || !mobile.trim()}
            onClick={() => {
              if (
                !window.confirm(
                  "Auto-generate a temporary 6-digit PIN for this user?"
                )
              ) {
                return;
              }
              run(
                privileged ? "force_generate_pin" : "generate_pin",
                { mobile, autoGenerate: true },
                { requireOverride: privileged && security.actorIsDeveloper }
              );
            }}
            className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Auto-generate PIN
          </button>
        </div>
        {generatedPin && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 max-w-md">
            <p className="font-semibold">Temporary PIN (copy now)</p>
            <p className="mt-1 font-mono text-2xl tracking-[0.35em]">
              {generatedPin}
            </p>
            <p className="mt-2 text-xs text-amber-900">
              This PIN will not be shown again. Share it securely with the user.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h3 className="font-semibold">Account status</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || user.is_active}
            onClick={() => run("enable_user", { isActive: true })}
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Enable / restore
          </button>
          <button
            type="button"
            disabled={pending || !user.is_active || Boolean(user.is_primary_owner)}
            onClick={() =>
              run(
                "set_active",
                { isActive: false },
                {
                  requireOverride: privileged && security.actorIsDeveloper,
                }
              )
            }
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
          >
            Deactivate
          </button>
          <button
            type="button"
            disabled={pending || !locked}
            onClick={() =>
              run("unlock", {}, { requireOverride: privileged && security.actorIsDeveloper })
            }
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Unlock locked account
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Logout this user from all devices?")) return;
              run(
                "revoke_all",
                {},
                { requireOverride: privileged && security.actorIsDeveloper }
              );
            }}
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Logout from all devices
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Reset all remembered devices?")) return;
              run(
                "reset_devices",
                {},
                { requireOverride: privileged && security.actorIsDeveloper }
              );
            }}
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Reset remembered devices
          </button>
        </div>
      </section>

      {security.actorIsDeveloper && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
          <h3 className="font-semibold">Change role</h3>
          <p className="text-sm text-[var(--muted)]">
            Primary Owner cannot be demoted in the normal UI. Changing roles
            requires Developer Override confirmation.
          </p>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={Boolean(user.is_primary_owner)}
            className="w-full max-w-sm rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={
              pending || role === user.role || Boolean(user.is_primary_owner)
            }
            onClick={() => {
              if (!window.confirm(`Change role to ${role}?`)) return;
              run("change_role", { role }, { requireOverride: true });
            }}
            className="rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Save role
          </button>
        </section>
      )}

      {security.actorIsDeveloper && !user.is_primary_owner && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
          <h3 className="font-semibold text-red-900">Delete user</h3>
          <p className="text-sm text-red-800">
            Soft-deletes by default (deactivate + revoke). Hard delete removes
            the auth user. Type DELETE and provide Developer Override.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder='Type DELETE'
            className="w-full max-w-sm rounded-md border border-red-300 bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  "delete_user",
                  { hardDelete: false },
                  { requireOverride: true, requireConfirmWord: "DELETE" }
                )
              }
              className="rounded-md border border-red-400 px-3 py-2 text-sm font-semibold text-red-900"
            >
              Soft delete
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  "delete_user",
                  { hardDelete: true },
                  { requireOverride: true, requireConfirmWord: "DELETE" }
                )
              }
              className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Hard delete
            </button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-semibold">Devices / sessions</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] py-2"
            >
              <div>
                <p className="font-medium">
                  {d.device_label || "Device"}
                  {d.revoked_at ? " · revoked" : " · active"}
                </p>
                <p className="text-[var(--muted)]">
                  Last seen{" "}
                  {d.last_seen_at
                    ? new Date(d.last_seen_at).toLocaleString()
                    : "—"}
                  {d.ip_address ? ` · ${d.ip_address}` : ""}
                </p>
              </div>
              {!d.revoked_at && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run("revoke_device", { deviceId: d.id })}
                  className="rounded-md border px-2 py-1 text-xs font-semibold"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
          {devices.length === 0 && (
            <li className="text-[var(--muted)]">No remembered devices.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
