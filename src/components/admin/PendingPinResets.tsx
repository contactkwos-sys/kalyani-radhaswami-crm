"use client";

import Link from "next/link";

type ResetRequest = {
  id: string;
  mobile_number: string;
  user_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  requested_ip: string | null;
};

type UserRow = {
  id: string;
  full_name: string;
  mobile_number: string | null;
};

export function PendingPinResets({
  requests,
  users,
}: {
  requests: ResetRequest[];
  users: UserRow[];
}) {
  if (!requests.length) return null;

  const byId = new Map(users.map((u) => [u.id, u]));
  const byMobile = new Map(
    users
      .filter((u) => u.mobile_number)
      .map((u) => [u.mobile_number as string, u])
  );

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <h3 className="font-semibold text-amber-950">Pending Forgot PIN requests</h3>
      <p className="mt-1 text-sm text-amber-900">
        Existing PINs are never revealed. Open the user Security page and issue
        a new temporary PIN, then mark the request complete from that flow.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {requests.map((r) => {
          const user =
            (r.user_id && byId.get(r.user_id)) ||
            byMobile.get(r.mobile_number) ||
            null;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
            >
              <div>
                <p className="font-medium text-[var(--ink)]">
                  {user?.full_name || "Unknown / unmatched account"}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Mobile ···{r.mobile_number.slice(-4)} · requested{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              {user ? (
                <Link
                  href={`/settings/users/${user.id}/security`}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Reset PIN
                </Link>
              ) : (
                <span className="text-xs text-[var(--muted)]">No linked user</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
