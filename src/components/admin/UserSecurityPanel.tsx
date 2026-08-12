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
  has_pin: boolean;
};

export function UserSecurityPanel({
  user,
  devices: initialDevices,
}: {
  user: UserInfo;
  devices: Device[];
}) {
  const router = useRouter();
  const [mobile, setMobile] = useState(user.mobile_number || "");
  const [newPin, setNewPin] = useState("");
  const [devices, setDevices] = useState(initialDevices);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: string, body: Record<string, unknown> = {}) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/security`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessage(data.message || "Saved.");
      setNewPin("");
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
        </p>
        <p>Last login: {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}</p>
        <p>PIN set: {user.has_pin ? "Yes" : "No"}</p>
        <p>
          PIN updated:{" "}
          {user.pin_updated_at
            ? new Date(user.pin_updated_at).toLocaleString()
            : "—"}
        </p>
      </section>

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
        <h3 className="font-semibold">Set / Reset PIN</h3>
        <p className="text-sm text-[var(--muted)]">
          Admin never sees the existing PIN. Setting a new PIN signs the user
          out of all devices.
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
        <button
          type="button"
          disabled={pending || newPin.length < 4}
          onClick={() => run("reset_pin", { newPin, mobile })}
          className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Reset PIN
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
        <h3 className="font-semibold">Account status</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || user.is_active}
            onClick={() => run("set_active", { isActive: true })}
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Enable user
          </button>
          <button
            type="button"
            disabled={pending || !user.is_active}
            onClick={() => run("set_active", { isActive: false })}
            className="rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-800"
          >
            Disable user
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run("revoke_all")}
            className="rounded-md border px-3 py-2 text-sm font-semibold"
          >
            Logout from all devices
          </button>
        </div>
      </section>

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
